# ContentFlow Studio – Architektur

## Ziel

ContentFlow Studio ist eine lokale macOS-Automationsplattform für KI-gestützte Medienproduktion. Der erste vorinstallierte Workflow ist **News URL → TikTok Video**. Die Oberfläche folgt einem Node-/Flow-Prinzip ähnlich Make.com.

## Leitprinzipien

1. **Local first** – LLM, TTS, Transkription und Rendering sollen nach Möglichkeit lokal auf Apple Silicon laufen.
2. **Provider statt Lock-in** – jeder AI-/Media-Node spricht gegen eine Provider-Schnittstelle. Ollama ist V1, MLX Runtime ist das Ziel für die integrierte lokale KI.
3. **Flow ist Datenmodell** – Nodes und Edges definieren den Workflow; die UI ist nicht die Workflow-Logik.
4. **Strukturierte Übergaben** – Agenten geben definierte Datenobjekte weiter statt unkontrollierter Freitexte.
5. **Cloud optional** – Replicate, Kling, Runway, ElevenLabs etc. werden Plugins, nicht Kernabhängigkeiten.
6. **Reproduzierbare Produktion** – jeder Run erhält Eingaben, Node-Ergebnisse, Assets, Logs und Exporte.

## Schichten

```
Tauri macOS App
  └─ React / React Flow UI
      └─ Workflow Definition
          └─ Workflow Runtime
              ├─ Agent Providers
              │   ├─ Ollama (V1)
              │   └─ Embedded MLX (Ziel)
              ├─ Media Providers
              │   ├─ Article Reader
              │   ├─ Asset Search
              │   ├─ TTS
              │   ├─ Captions
              │   └─ FFmpeg / VideoToolbox
              └─ Optional Cloud Plugins
```

## Node-Kategorien

- **Input:** URL, Datei, Text, Feed
- **Agent:** Research, Fact Check, Script, Storyboard, QC
- **Media:** Search, TTS, Image, Video, Captions, Composer
- **Logic:** Router, Filter, Merge, Retry
- **Output:** MP4, Projekt, Publish

## V1 Datenfluss

```
News URL
  ↓
Article Reader
  ↓
Research Agent
  ↓
Script Agent
  ├──────────────→ Local TTS ─────────┐
  ↓                                   │
Storyboard Agent                      │
  ↓                                   │
Asset Search ─────────────────────────┤
                                      ↓
                                Video Composer
                                      ↓
                                   QC Agent
                                      ↓
                                    Export
```

## Lokale KI

### V1
Ollama auf localhost. Vorteil: schneller Entwicklungsstart und freie Modellwahl.

### Ziel
In-App Model Manager:

- erkennt Apple-Silicon-Chip und verfügbaren Arbeitsspeicher
- bietet freigegebene MLX-Modelle an
- lädt Modelle in den App-Datenbereich
- prüft Integrität/Version
- startet und stoppt die lokale Runtime
- ermöglicht pro Node eine Modellauswahl
- funktioniert ohne Terminal und ohne manuelle Python-Installation

## Workflow Runtime

Die Runtime muss:

- DAGs validieren
- Zyklen verhindern
- Abhängigkeiten auflösen
- Nodes in topologischer Reihenfolge ausführen
- parallele Zweige später parallelisieren
- Status, Logs und Fehler pro Node speichern
- Retry/Fallback ermöglichen
- Runs abbrechen können

## Persistenz (nächster Ausbau)

SQLite:

- projects
- workflows
- workflow_nodes
- workflow_edges
- runs
- run_steps
- assets
- model_installations
- provider_settings

## Sicherheits-/Qualitätsprinzipien für News

- Quelltext und abgeleitete Fakten getrennt speichern
- Research Agent darf keine Fakten erfinden
- Script Agent arbeitet auf Research-Ergebnis und Quelltext
- QC Node prüft Zahlen, Namen und Kernaussagen gegen den Run-Kontext
- Lizenz-/Quelleninformationen von Assets mitführen
