# Schachuhr – Plan

## 1. Recherche: Wie funktioniert eine Schachuhr?

Eine Schachuhr besteht aus zwei gekoppelten Uhren. Es läuft immer nur die Uhr des
Spielers, der gerade am Zug ist. Nach seinem Zug drückt er seinen Knopf. Dadurch
hält seine Uhr an und die des Gegners startet.

**Regeln (FIDE, Artikel 6 „The Chessclock“):**

- **Start:** Schwarz startet die Uhr von Weiß, denn Weiß macht den ersten Zug.
- **Fallblättchen (flag fall):** Ist die Zeit eines Spielers abgelaufen, „fällt sein
  Blättchen“. Er verliert, sofern der Gegner noch matt setzen kann. Die Uhr zeigt
  das an; den Sieg erklären Spieler oder Schiedsrichter.
- **Pause:** Die Uhr darf angehalten werden, etwa wenn der Schiedsrichter eingreift.

**Zeitmodi:**

| Modus | Verhalten |
|---|---|
| **Sudden Death** | Jeder Spieler hat eine feste Zeit, ohne Zugabe. |
| **Fischer (Inkrement)** | Nach jedem Zug kommt eine feste Zeit *x* dazu, auch nach dem ersten Zug. Die Restzeit kann wachsen. |
| **Bronstein-Delay** | Nach dem Zug wird die verbrauchte Zeit gutgeschrieben, höchstens *x*. Die Restzeit kann nie wachsen. |
| **Simple Delay (US-Delay)** | Zu Beginn jedes Zuges wartet die Uhr *x* Sekunden, bevor die Hauptzeit läuft. Ungenutzte Delay-Zeit verfällt. |
| **Mehrstufig (klassisch)** | Zum Beispiel 90 min für 40 Züge, dann +30 min. Bei Erreichen der Zugzahl kommt Zeit dazu. |

Bronstein und Simple Delay lassen das Blättchen im selben Moment fallen.
Bronstein zeigt dabei aber die Gesamtzeit an.

**Übliche Vorgaben:** Bullet 1+0 und 2+1, Blitz 3+0, 3+2 und 5+0, Rapid 10+0,
10+5 und 15+10, Klassisch 90/40+30 mit +30 s Inkrement.

## 2. Architektur

Eine statische Web-App (HTML/CSS/JS) ohne Build-Schritt. Sie läuft auf Handy und
Tablet zwischen zwei Spielern und lässt sich direkt über GitHub Pages hosten.

```
index.html        Oberfläche (zwei große Tasten, Steuerleiste, Einstellungen)
style.css         Layout; obere Hälfte um 180° gedreht für das Gegenüber
src/clock.js      Reine Uhr-Logik (kein DOM, Zeitquelle injizierbar → testbar)
src/app.js        UI-Anbindung: Rendering, Eingaben, Ton, Wake-Lock
test/clock.test.js  Unit-Tests mit `node --test` (keine Abhängigkeiten)
```

**Engine (`ChessClock`):**
- Zustände: `idle → running ⇄ paused → flagged`
- Pro Spieler: Restzeit (ms) und Zuganzahl
- `press(player, now)`: beendet den Zug von `player` und startet den Gegner.
  Im Zustand `idle` startet der Druck die Uhr des Gegners (Schwarz startet Weiß).
- `tick(now)`: prüft auf Fallblättchen
- `pause(now)`, `resume(now)`, `reset()`
- Weil der Zeitstempel übergeben wird, lässt sich alles deterministisch testen.
  Die Zeit wird als Differenz gerechnet, nicht durch Aufsummieren von Ticks.
  So entsteht keine Drift.

**UI-Funktionen:**
- Ganze Bildschirmhälfte als Taste, für jeden Spieler. Die obere Hälfte ist gedreht.
- Tastatur: linke Shift-Taste = oben, rechte Shift-Taste = unten, Leertaste = Pause
- Zehntelsekunden unter 10 s, Warnfarbe unter 10 s, rote Anzeige bei Zeitablauf
- Anzeige von Zugzähler und Delay-Countdown
- Vorgaben und eigene Einstellungen, auch unterschiedliche Zeiten (Handicap)
- Kurzer Ton beim Umschalten und bei Zeitablauf, Bildschirm bleibt an (Wake Lock)

## 3. Später: GitHub Workflow

- **CI:** Bei jedem Push und Pull Request laufen die Tests mit `node --test`.
- **Deploy:** Bei Push auf `main` wird die Seite auf GitHub Pages veröffentlicht.
