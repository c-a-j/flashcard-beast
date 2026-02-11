use tauri::Manager;

fn db_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.join("cards.db"))
}

fn init_db(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("INSERT OR IGNORE INTO collections (name) VALUES ('Default')", [])
        .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            collection_id INTEGER NOT NULL DEFAULT 1 REFERENCES collections(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migrate existing DB: add collection_id if missing (ALTER fails if column already exists)
    if conn.execute("ALTER TABLE cards ADD COLUMN collection_id INTEGER", []).is_err() {
        // Column already exists, ignore
    }
    let default_id: i64 = conn
        .query_row("SELECT id FROM collections LIMIT 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute("UPDATE cards SET collection_id = ?1 WHERE collection_id IS NULL", rusqlite::params![default_id])
        .map_err(|e| e.to_string())?;
    // Optional title displayed in top left of card
    if conn.execute("ALTER TABLE cards ADD COLUMN title TEXT NOT NULL DEFAULT ''", []).is_err() {
        // Column already exists
    }
    // Skipped (known) state for study session persistence
    if conn.execute("ALTER TABLE cards ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0", []).is_err() {
        // Column already exists
    }
    Ok(())
}

#[tauri::command]
fn add_card(
    app: tauri::AppHandle,
    question: String,
    answer: String,
    collection_id: i64,
    title: Option<String>,
) -> Result<(), String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    let title = title.unwrap_or_default();
    conn.execute(
        "INSERT INTO cards (question, answer, collection_id, title) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![question, answer, collection_id, title],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
struct StoredCollection {
    id: i64,
    name: String,
}

#[tauri::command]
fn get_collections(app: tauri::AppHandle) -> Result<Vec<StoredCollection>, String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM collections ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StoredCollection {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut collections = Vec::new();
    for row in rows {
        collections.push(row.map_err(|e| e.to_string())?);
    }
    Ok(collections)
}

#[tauri::command]
fn create_collection(app: tauri::AppHandle, name: String) -> Result<StoredCollection, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Collection name cannot be empty".to_string());
    }
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    conn.execute("INSERT INTO collections (name) VALUES (?1)", rusqlite::params![name])
        .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(StoredCollection {
        id,
        name: name.to_string(),
    })
}

#[derive(serde::Serialize)]
struct StoredCard {
    id: i64,
    question: String,
    answer: String,
    title: String,
    skipped: bool,
}

/// Card data for export/import (no id, no skipped).
#[derive(serde::Serialize, serde::Deserialize)]
struct ExportCard {
    question: String,
    answer: String,
    title: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ExportCollection {
    name: String,
    cards: Vec<ExportCard>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ExportData {
    collections: Vec<ExportCollection>,
}

#[derive(serde::Serialize)]
struct ImportResult {
    collections: u32,
    cards_added: u32,
}

#[derive(serde::Serialize)]
struct FileCollectionSummary {
    name: String,
    card_count: u32,
}

#[tauri::command]
fn get_cards(app: tauri::AppHandle, collection_id: i64) -> Result<Vec<StoredCard>, String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    let mut stmt = conn
        .prepare("SELECT id, question, answer, COALESCE(title, ''), COALESCE(skipped, 0) FROM cards WHERE collection_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![collection_id], |row| {
            Ok(StoredCard {
                id: row.get(0)?,
                question: row.get(1)?,
                answer: row.get(2)?,
                title: row.get(3)?,
                skipped: row.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut cards = Vec::new();
    for row in rows {
        cards.push(row.map_err(|e| e.to_string())?);
    }
    Ok(cards)
}

#[tauri::command]
fn update_card(
    app: tauri::AppHandle,
    id: i64,
    question: String,
    answer: String,
    collection_id: i64,
    title: Option<String>,
) -> Result<(), String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    let title = title.unwrap_or_default();
    conn.execute(
        "UPDATE cards SET question = ?1, answer = ?2, collection_id = ?3, title = ?4 WHERE id = ?5",
        rusqlite::params![question, answer, collection_id, title, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_card(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    conn.execute("DELETE FROM cards WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_card_skipped(app: tauri::AppHandle, card_id: i64, skipped: bool) -> Result<(), String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    conn.execute(
        "UPDATE cards SET skipped = ?1 WHERE id = ?2",
        rusqlite::params![if skipped { 1i64 } else { 0i64 }, card_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn clear_skipped_for_collection(app: tauri::AppHandle, collection_id: i64) -> Result<(), String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    conn.execute(
        "UPDATE cards SET skipped = 0 WHERE collection_id = ?1",
        rusqlite::params![collection_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_collection_to_path(app: tauri::AppHandle, collection_id: i64, path: String) -> Result<(), String> {
    let db_path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    init_db(&conn)?;

    let name: String = conn
        .query_row("SELECT name FROM collections WHERE id = ?1", rusqlite::params![collection_id], |row| row.get(0))
        .map_err(|_| "Collection not found".to_string())?;

    let mut cards: Vec<ExportCard> = Vec::new();
    let mut card_stmt = conn
        .prepare("SELECT question, answer, COALESCE(title, '') FROM cards WHERE collection_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let card_rows = card_stmt
        .query_map(rusqlite::params![collection_id], |row| {
            Ok(ExportCard {
                question: row.get(0)?,
                answer: row.get(1)?,
                title: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    for card in card_rows {
        cards.push(card.map_err(|e| e.to_string())?);
    }

    let collections = vec![ExportCollection { name, cards }];
    let data = ExportData { collections };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_collections_to_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let db_path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    init_db(&conn)?;

    let mut collections: Vec<ExportCollection> = Vec::new();
    let mut coll_stmt = conn
        .prepare("SELECT id, name FROM collections ORDER BY name")
        .map_err(|e| e.to_string())?;
    let coll_rows = coll_stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    for row in coll_rows {
        let (coll_id, name) = row.map_err(|e| e.to_string())?;
        let mut cards: Vec<ExportCard> = Vec::new();
        let mut card_stmt = conn
            .prepare("SELECT question, answer, COALESCE(title, '') FROM cards WHERE collection_id = ?1 ORDER BY id")
            .map_err(|e| e.to_string())?;
        let card_rows = card_stmt
            .query_map(rusqlite::params![coll_id], |row| {
                Ok(ExportCard {
                    question: row.get(0)?,
                    answer: row.get(1)?,
                    title: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for card in card_rows {
            cards.push(card.map_err(|e| e.to_string())?);
        }
        collections.push(ExportCollection { name, cards });
    }

    let data = ExportData { collections };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Read an export file and return list of collections (name + card count) for the import modal.
#[tauri::command]
fn read_export_file(path: String) -> Result<Vec<FileCollectionSummary>, String> {
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: ExportData = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let list: Vec<FileCollectionSummary> = data
        .collections
        .into_iter()
        .map(|c| FileCollectionSummary {
            name: c.name,
            card_count: c.cards.len() as u32,
        })
        .collect();
    Ok(list)
}

/// Import one collection from an export file into an existing collection or a new one.
#[tauri::command]
fn import_collection_from_file(
    app: tauri::AppHandle,
    path: String,
    file_collection_index: u32,
    destination_collection_id: Option<i64>,
    destination_new_name: Option<String>,
) -> Result<ImportResult, String> {
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: ExportData = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let exp_coll = data
        .collections
        .get(file_collection_index as usize)
        .ok_or_else(|| "Invalid collection index".to_string())?;

    let db_path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    init_db(&conn)?;

    let collection_id: i64 = match (destination_collection_id, destination_new_name.as_deref().map(str::trim)) {
        (Some(id), _) => id,
        (None, Some(name)) if !name.is_empty() => {
            conn.execute("INSERT INTO collections (name) VALUES (?1)", rusqlite::params![name])
                .map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        }
        _ => return Err("Specify an existing collection or a new collection name".to_string()),
    };

    let mut cards_added: u32 = 0;
    for card in &exp_coll.cards {
        conn.execute(
            "INSERT INTO cards (question, answer, collection_id, title) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                card.question.trim(),
                card.answer.trim(),
                collection_id,
                card.title.trim(),
            ],
        )
        .map_err(|e| e.to_string())?;
        cards_added += 1;
    }

    Ok(ImportResult {
        collections: 1,
        cards_added,
    })
}

#[tauri::command]
fn import_collections_from_path(app: tauri::AppHandle, path: String) -> Result<ImportResult, String> {
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: ExportData = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    let db_path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    init_db(&conn)?;

    let mut collections_count: u32 = 0;
    let mut cards_added: u32 = 0;

    for exp_coll in data.collections {
        let name = exp_coll.name.trim();
        if name.is_empty() {
            continue;
        }
        let collection_id: i64 = match conn.query_row(
            "SELECT id FROM collections WHERE name = ?1",
            rusqlite::params![name],
            |row| row.get(0),
        ) {
            Ok(id) => id,
            Err(_) => {
                conn.execute("INSERT INTO collections (name) VALUES (?1)", rusqlite::params![name])
                    .map_err(|e| e.to_string())?;
                conn.last_insert_rowid()
            }
        };
        collections_count += 1;
        for card in exp_coll.cards {
            conn.execute(
                "INSERT INTO cards (question, answer, collection_id, title) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    card.question.trim(),
                    card.answer.trim(),
                    collection_id,
                    card.title.trim(),
                ],
            )
            .map_err(|e| e.to_string())?;
            cards_added += 1;
        }
    }

    Ok(ImportResult {
        collections: collections_count,
        cards_added,
    })
}

fn extensions_for_format(format: &str) -> Vec<String> {
    let ext_lower = format.to_lowercase();
    match ext_lower.as_str() {
        "jpeg" => vec!["jpg".into(), "jpeg".into()],
        _ => vec![ext_lower],
    }
}

/// Count files in a directory whose extension matches the given format (e.g. "png", "jpeg").
#[tauri::command]
fn count_files_in_directory(directory: String, format: String) -> Result<u32, String> {
    let extensions = extensions_for_format(&format);
    let dir = std::path::Path::new(&directory);
    if !dir.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut count = 0u32;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase());
            if ext.map(|e| extensions.contains(&e)).unwrap_or(false) {
                count += 1;
            }
        }
    }
    Ok(count)
}

/// List full paths of files in a directory whose extension matches the given format. Sorted for stable order.
#[tauri::command]
fn list_files_in_directory(directory: String, format: String) -> Result<Vec<String>, String> {
    let extensions = extensions_for_format(&format);
    let dir = std::path::Path::new(&directory);
    if !dir.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut paths: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|path| path.is_file())
        .filter(|path| {
            path.extension()
                .and_then(|e| e.to_str())
                .map(|s| extensions.contains(&s.to_lowercase()))
                .unwrap_or(false)
        })
        .filter_map(|p| p.into_os_string().into_string().ok())
        .collect();
    paths.sort();
    Ok(paths)
}

/// Read a file and return its contents as base64. Used so the frontend can pass image data to Tesseract.js.
#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, add_card, get_cards, get_collections, create_collection, update_card, delete_card, set_card_skipped, clear_skipped_for_collection, export_collection_to_path, export_collections_to_path, read_export_file, import_collection_from_file, import_collections_from_path, count_files_in_directory, list_files_in_directory, read_file_base64])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
