# Schachuhr

[![CI & Deploy](https://github.com/dizzle-code/chess-clock/actions/workflows/ci.yml/badge.svg)](https://github.com/dizzle-code/chess-clock/actions/workflows/ci.yml)

Schachuhr als Web-App für Handy, Tablet und Desktop. Sie braucht keine Abhängigkeiten
und keinen Build-Schritt.

## Funktionen

- Modi: **Sudden Death**, **Fischer-Inkrement**, **Bronstein-Delay**, **Simple Delay (US)**
- Mehrstufige Zeitkontrollen, z. B. FIDE 90 min / 40 Züge + 30 min, +30 s je Zug
- Vorgaben für Bullet, Blitz, Rapid und Klassisch sowie eigene Zeiten und Handicap
- Die obere Hälfte ist gedreht, damit beide Spieler ihre Zeit lesen können
- Zugzähler, Delay-Anzeige, Zehntelsekunden unter 10 s, Fallblättchen-Anzeige
- Ton, Pause, Bildschirm bleibt an (Wake Lock), Einstellungen werden gespeichert

## Bedienung

| Aktion | Touch | Tastatur |
|---|---|---|
| Zug beenden (oben/links) | eigene Hälfte antippen | linke Shift-Taste / `A` |
| Zug beenden (unten/rechts) | eigene Hälfte antippen | rechte Shift-Taste / `L` |
| Pause / Weiter | ⏸ | Leertaste |

Zum Start tippt **Schwarz** auf seine Seite. Dann läuft die Uhr von Weiß.

## Lokal starten

```bash
npm start      # startet http://localhost:8000 (benötigt python3)
npm test       # Unit-Tests der Uhr-Logik (Node ≥ 18)
```

Die Seite muss über einen Webserver geöffnet werden, weil die ES-Module nicht per
`file://` laden.

## GitHub Workflow

`.github/workflows/ci.yml` läuft bei jedem Push und Pull Request:

1. **Tests** mit Node 20 und 22 (`npm test`)
2. **Deploy auf GitHub Pages**, nur bei Push auf `main` und nur wenn die Tests grün sind

Einmalig nötig: Im Repository unter *Settings → Pages → Build and deployment → Source*
**GitHub Actions** auswählen.

Details zu Recherche und Architektur stehen in [PLAN.md](PLAN.md).
