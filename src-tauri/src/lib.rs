use tauri::Manager;

const NULL_SUB_COLLECTION_NAME: &str = "- None -";

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
        "CREATE TABLE IF NOT EXISTS sub_collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            collection_id INTEGER NOT NULL REFERENCES collections(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(collection_id, name)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO sub_collections (name, collection_id) VALUES (?1, 1)",
        rusqlite::params![NULL_SUB_COLLECTION_NAME],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            collection_id INTEGER NOT NULL REFERENCES collections(id),
            title TEXT NOT NULL DEFAULT '',
            skipped INTEGER NOT NULL DEFAULT 0,
            sub_collection_id INTEGER NOT NULL REFERENCES sub_collections(id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS cards_uniq_collection_sub_question_answer ON cards(collection_id, sub_collection_id, question, answer)",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_card(
    app: tauri::AppHandle,
    question: String,
    answer: String,
    collection_id: i64,
    title: Option<String>,
    sub_collection_id: Option<i64>,
) -> Result<(), String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    let title = title.unwrap_or_default();
    let sub_id = match sub_collection_id {
        Some(id) => id,
        None => get_null_sub_collection_id(&conn, collection_id)?,
    };
    conn.execute(
        "INSERT INTO cards (question, answer, collection_id, title, sub_collection_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![question, answer, collection_id, title, sub_id],
    )
    .map_err(|e| map_unique_constraint(e))?;
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
    conn.execute(
        "INSERT INTO sub_collections (name, collection_id) VALUES (?1, ?2)",
        rusqlite::params![NULL_SUB_COLLECTION_NAME, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(StoredCollection {
        id,
        name: name.to_string(),
    })
}

#[derive(serde::Serialize)]
struct StoredSubCollection {
    id: i64,
    name: String,
    collection_id: i64,
}

/// Returns the id of the reserved null-sub-collection for the given collection (used when a card has no real sub-collection).
fn get_null_sub_collection_id(conn: &rusqlite::Connection, collection_id: i64) -> Result<i64, String> {
    conn.query_row(
        "SELECT id FROM sub_collections WHERE collection_id = ?1 AND name = ?2",
        rusqlite::params![collection_id, NULL_SUB_COLLECTION_NAME],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sub_collections(app: tauri::AppHandle, collection_id: i64) -> Result<Vec<StoredSubCollection>, String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    let mut stmt = conn
        .prepare("SELECT id, name, collection_id FROM sub_collections WHERE collection_id = ?1 ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![collection_id], |row| {
            Ok(StoredSubCollection {
                id: row.get(0)?,
                name: row.get(1)?,
                collection_id: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut sub_collections = Vec::new();
    for row in rows {
        sub_collections.push(row.map_err(|e| e.to_string())?);
    }
    Ok(sub_collections)
}

#[tauri::command]
fn create_sub_collection(app: tauri::AppHandle, collection_id: i64, name: String) -> Result<StoredSubCollection, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Sub collection name cannot be empty".to_string());
    }
    if name.eq_ignore_ascii_case(NULL_SUB_COLLECTION_NAME) {
        return Err("That name is reserved for internal use.".to_string());
    }
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    conn.execute(
        "INSERT INTO sub_collections (name, collection_id) VALUES (?1, ?2)",
        rusqlite::params![name, collection_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(StoredSubCollection {
        id,
        name: name.to_string(),
        collection_id,
    })
}

#[derive(serde::Serialize)]
struct StoredCard {
    id: i64,
    question: String,
    answer: String,
    title: String,
    skipped: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    sub_collection_id: Option<i64>,
}

/// Card data for export/import (no id, no skipped).
#[derive(serde::Serialize, serde::Deserialize)]
struct ExportCard {
    question: String,
    answer: String,
    title: String,
    /// Sub-collection name for this card; used on import to match/create sub-collections.
    #[serde(default)]
    sub_collection_name: Option<String>,
}

/// Sub-collection export (name only; id is recreated on import).
#[derive(serde::Serialize, serde::Deserialize)]
struct ExportSubCollection {
    name: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ExportCollection {
    name: String,
    #[serde(default)]
    sub_collections: Vec<ExportSubCollection>,
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
    sub_collection_count: u32,
}

#[tauri::command]
fn get_cards(app: tauri::AppHandle, collection_id: i64) -> Result<Vec<StoredCard>, String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    let mut stmt = conn
        .prepare("SELECT id, question, answer, COALESCE(title, ''), COALESCE(skipped, 0), sub_collection_id FROM cards WHERE collection_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![collection_id], |row| {
            Ok(StoredCard {
                id: row.get(0)?,
                question: row.get(1)?,
                answer: row.get(2)?,
                title: row.get(3)?,
                skipped: row.get::<_, i64>(4)? != 0,
                sub_collection_id: row.get::<_, Option<i64>>(5)?,
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
    sub_collection_id: Option<i64>,
) -> Result<(), String> {
    let path = db_path(&app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    init_db(&conn)?;
    let title = title.unwrap_or_default();
    let sub_id = match sub_collection_id {
        Some(sid) => sid,
        None => get_null_sub_collection_id(&conn, collection_id)?,
    };
    conn.execute(
        "UPDATE cards SET question = ?1, answer = ?2, collection_id = ?3, title = ?4, sub_collection_id = ?5 WHERE id = ?6",
        rusqlite::params![question, answer, collection_id, title, sub_id, id],
    )
    .map_err(|e| map_unique_constraint(e))?;
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

    let mut sub_list: Vec<(i64, String)> = Vec::new();
    let mut sub_stmt = conn
        .prepare("SELECT id, name FROM sub_collections WHERE collection_id = ?1 AND name != ?2 ORDER BY name")
        .map_err(|e| e.to_string())?;
    let sub_rows = sub_stmt
        .query_map(rusqlite::params![collection_id, NULL_SUB_COLLECTION_NAME], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in sub_rows {
        sub_list.push(row.map_err(|e| e.to_string())?);
    }
    let sub_collection_id_to_name: std::collections::HashMap<i64, String> = sub_list.iter().cloned().collect();
    let sub_collections: Vec<ExportSubCollection> = sub_list
        .into_iter()
        .map(|(_, name)| ExportSubCollection { name })
        .collect();

    let mut cards: Vec<ExportCard> = Vec::new();
    let mut card_stmt = conn
        .prepare("SELECT question, answer, COALESCE(title, ''), sub_collection_id FROM cards WHERE collection_id = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let card_rows = card_stmt
        .query_map(rusqlite::params![collection_id], |row| {
            let sub_id: Option<i64> = row.get(3)?;
            let sub_collection_name = sub_id.and_then(|id| sub_collection_id_to_name.get(&id).cloned());
            Ok(ExportCard {
                question: row.get(0)?,
                answer: row.get(1)?,
                title: row.get(2)?,
                sub_collection_name,
            })
        })
        .map_err(|e| e.to_string())?;
    for card in card_rows {
        cards.push(card.map_err(|e| e.to_string())?);
    }

    let collections = vec![ExportCollection {
        name,
        sub_collections,
        cards,
    }];
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
        let mut sub_list: Vec<(i64, String)> = Vec::new();
        let mut sub_stmt = conn
            .prepare("SELECT id, name FROM sub_collections WHERE collection_id = ?1 AND name != ?2 ORDER BY name")
            .map_err(|e| e.to_string())?;
        for sub_row in sub_stmt
            .query_map(rusqlite::params![coll_id, NULL_SUB_COLLECTION_NAME], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
        {
            sub_list.push(sub_row.map_err(|e| e.to_string())?);
        }
        let sub_collection_id_to_name: std::collections::HashMap<i64, String> = sub_list.iter().cloned().collect();
        let sub_collections: Vec<ExportSubCollection> = sub_list
            .into_iter()
            .map(|(_, n)| ExportSubCollection { name: n })
            .collect();

        let mut cards: Vec<ExportCard> = Vec::new();
        let mut card_stmt = conn
            .prepare("SELECT question, answer, COALESCE(title, ''), sub_collection_id FROM cards WHERE collection_id = ?1 ORDER BY id")
            .map_err(|e| e.to_string())?;
        let card_rows = card_stmt
            .query_map(rusqlite::params![coll_id], |row| {
                let sub_id: Option<i64> = row.get(3)?;
                let sub_collection_name = sub_id.and_then(|id| sub_collection_id_to_name.get(&id).cloned());
                Ok(ExportCard {
                    question: row.get(0)?,
                    answer: row.get(1)?,
                    title: row.get(2)?,
                    sub_collection_name,
                })
            })
            .map_err(|e| e.to_string())?;
        for card in card_rows {
            cards.push(card.map_err(|e| e.to_string())?);
        }
        collections.push(ExportCollection {
            name,
            sub_collections,
            cards,
        });
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
            sub_collection_count: c.sub_collections.len() as u32,
        })
        .collect();
    Ok(list)
}

/// Map UNIQUE constraint violations to a user-friendly message; pass through other errors.
fn map_unique_constraint(e: rusqlite::Error) -> String {
    match &e {
        rusqlite::Error::SqliteFailure(_, msg) if msg.as_deref().map(|s| s.contains("UNIQUE") || s.contains("unique")).unwrap_or(false) => {
            "A card with this question and answer already exists in this sub-collection.".to_string()
        }
        _ => e.to_string(),
    }
}

/// Get or create a sub-collection by name; returns its id.
fn get_or_create_sub_collection(
    conn: &rusqlite::Connection,
    collection_id: i64,
    name: &str,
) -> Result<i64, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Sub collection name cannot be empty".to_string());
    }
    if let Ok(id) = conn.query_row(
        "SELECT id FROM sub_collections WHERE collection_id = ?1 AND name = ?2",
        rusqlite::params![collection_id, name],
        |row| row.get(0),
    ) {
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO sub_collections (name, collection_id) VALUES (?1, ?2)",
        rusqlite::params![name, collection_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
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
            let id = conn.last_insert_rowid();
            conn.execute(
                "INSERT INTO sub_collections (name, collection_id) VALUES (?1, ?2)",
                rusqlite::params![NULL_SUB_COLLECTION_NAME, id],
            )
            .map_err(|e| e.to_string())?;
            id
        }
        _ => return Err("Specify an existing collection or a new collection name".to_string()),
    };

    let null_sub_id = get_null_sub_collection_id(&conn, collection_id)?;
    let mut name_to_sub_id: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    name_to_sub_id.insert(NULL_SUB_COLLECTION_NAME.to_string(), null_sub_id);
    for sub in &exp_coll.sub_collections {
        let name = sub.name.trim();
        if name.is_empty() {
            continue;
        }
        if !name_to_sub_id.contains_key(name) {
            let id = get_or_create_sub_collection(&conn, collection_id, name)?;
            name_to_sub_id.insert(name.to_string(), id);
        }
    }

    let mut cards_added: u32 = 0;
    for card in &exp_coll.cards {
        let question = card.question.trim();
        let answer = card.answer.trim();
        let sub_collection_id: i64 = card
            .sub_collection_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .and_then(|name| name_to_sub_id.get(name).copied())
            .unwrap_or(null_sub_id);
        let n = conn
            .execute(
                "INSERT OR IGNORE INTO cards (question, answer, collection_id, title, sub_collection_id) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![question, answer, collection_id, card.title.trim(), sub_collection_id],
            )
            .map_err(|e| e.to_string())?;
        cards_added += n as u32;
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
                let id = conn.last_insert_rowid();
                conn.execute(
                    "INSERT INTO sub_collections (name, collection_id) VALUES (?1, ?2)",
                    rusqlite::params![NULL_SUB_COLLECTION_NAME, id],
                )
                .map_err(|e| e.to_string())?;
                id
            }
        };
        collections_count += 1;

        let null_sub_id = get_null_sub_collection_id(&conn, collection_id)?;
        let mut name_to_sub_id: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        name_to_sub_id.insert(NULL_SUB_COLLECTION_NAME.to_string(), null_sub_id);
        for sub in &exp_coll.sub_collections {
            let sub_name = sub.name.trim();
            if sub_name.is_empty() {
                continue;
            }
            if !name_to_sub_id.contains_key(sub_name) {
                let id = get_or_create_sub_collection(&conn, collection_id, sub_name)?;
                name_to_sub_id.insert(sub_name.to_string(), id);
            }
        }

        for card in exp_coll.cards {
            let question = card.question.trim();
            let answer = card.answer.trim();
            let sub_collection_id: i64 = card
                .sub_collection_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .and_then(|n| name_to_sub_id.get(n).copied())
                .unwrap_or(null_sub_id);
            let n = conn
                .execute(
                    "INSERT OR IGNORE INTO cards (question, answer, collection_id, title, sub_collection_id) VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![question, answer, collection_id, card.title.trim(), sub_collection_id],
                )
                .map_err(|e| e.to_string())?;
            cards_added += n as u32;
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
        .invoke_handler(tauri::generate_handler![greet, add_card, get_cards, get_collections, create_collection, get_sub_collections, create_sub_collection, update_card, delete_card, set_card_skipped, clear_skipped_for_collection, export_collection_to_path, export_collections_to_path, read_export_file, import_collection_from_file, import_collections_from_path, count_files_in_directory, list_files_in_directory, read_file_base64])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
