import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { generateNotecard } from "@/lib/utils";

const OLLAMA_HOSTS = {
  local: "http://localhost:11434",
  cloud: "https://ollama.com",
} as const;

export function OllamaTest() {
  const [ollamaHost, setOllamaHost] = useState<"local" | "cloud">("local");
  const [model, setModel] = useState("glm-4.7-flash");
  const [notecardInfo, setNotecardInfo] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setError(null);
    setResponse(null);
    setLoading(true);
    let apiKey: string | undefined;
    try {
      const host = OLLAMA_HOSTS[ollamaHost];
      const isOllamaCloud = ollamaHost === "cloud";
      apiKey = isOllamaCloud
        ? await invoke<string>("get_ollama_api_key")
        : undefined;
      const message = await generateNotecard(
        notecardInfo.trim() || "Sample topic: photosynthesis",
        model,
        host,
        apiKey || undefined,
        isOllamaCloud ? tauriFetch : undefined
      );
      setResponse(message.content ?? "(empty response)");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const isUnauthorized = /unauthorized/i.test(errMsg);
      const withKey =
        isUnauthorized && apiKey !== undefined
          ? `${errMsg}\n\nAPI key (for verification): ${apiKey}`
          : isUnauthorized && apiKey === undefined
            ? `${errMsg}\n\nAPI key (for verification): (empty — not set in environment)`
            : errMsg;
      setError(withKey);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ollama Test</CardTitle>
          <CardDescription>
            Test the generateNotecard function. Use a local Ollama server or a cloud API URL. Enter information and get a question/answer notecard in JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid w-full gap-2">
            <Label htmlFor="ollama-host">Ollama host</Label>
            <Select
              value={ollamaHost}
              onValueChange={(v: "local" | "cloud") => {
                setOllamaHost(v);
                if (v === "cloud") setModel("deepseek-v3.1:671b-cloud");
                if (v === "local") setModel("glm-4.7-flash");
              }}
            >
              <SelectTrigger id="ollama-host" className="w-full">
                <SelectValue placeholder="Select host" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="cloud">Cloud</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid w-full gap-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="glm-4.7-flash"
            />
          </div>
          <div className="grid w-full gap-2">
            <Label htmlFor="notecard-info">Notecard information</Label>
            <Textarea
              id="notecard-info"
              value={notecardInfo}
              onChange={(e) => setNotecardInfo(e.target.value)}
              placeholder="Enter the information to turn into a notecard (e.g. a fact or topic)…"
              rows={4}
            />
          </div>
          <Button onClick={handleSend} disabled={loading}>
            {loading ? "Sending…" : "Send"}
          </Button>
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response</CardTitle>
          <CardDescription>
            Notecard (question/answer JSON) will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="min-h-[10rem] whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
            {response !== null ? response : "Response will appear here."}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
