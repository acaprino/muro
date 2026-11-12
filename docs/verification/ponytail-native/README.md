# Evidenze della consegna nativa Ponytail

Archivio della prova delimitata alle regole centrali e alla review di Ponytail
v5.3.3, commit `7801d061243d7b753bad0e0b3c057cd250b11755`. La raccolta di
questi file non ha rieseguito test, build o sessioni host. La precedente
[prova di contesto iniziale](../ponytail-probe/) resta invariata.

## Input e riproducibilità

- [sources.json](sources.json) conserva pin, selezioni e metadati del pacchetto
  nativo, sostituendo soltanto il percorso del mirror con l'URL HTTPS già
  verificato. Il testo di intake resta quello dell'esecuzione originale.
- [sources.executed.json](sources.executed.json) è il manifest eseguito esatto:
  richiede il database Git parziale `../upstream.git`, non incluso qui. La
  verifica locale degli oggetti non equivale a un nuovo fetch HTTPS riuscito.
- [delivery.json](delivery.json), [ROUTER.md](ROUTER.md),
  [capability](capabilities/change-review.md), [entries.json](entries.json),
  [esempi](guide-examples.json) e [casi eval](eval-cases.json) sono gli input
  del pacchetto nativo, copiati senza modifiche.

## Risultati conservati

| Evidenza | Esito e limite |
|---|---|
| [Release v3](native-release-v3-results.json) | 54 controlli riusciti su 54; 18 comandi con exit code 0. Verifica degli artefatti e dei confini simulati, non comportamento del modello. |
| [Eval v3](native-eval-v3/results.json) | 4 casi su 4; [decisioni](native-eval-v3/decisions.json), [contesti](native-eval-v3/contexts/contexts.json), [prompt](native-eval-v3/contexts/PROMPT.md) e [comandi](native-eval-v3/command-evidence.json) conservati. |
| [Suite completa iniziale](logs/muro-native-full-pytest.txt) | 372 passati, 13 falliti, 5 skip e 3 errori. |
| [Follow-up sorgenti](logs/muro-native-source-followup.txt) | 40 passati, 8 falliti; fallimenti del trasporto Git locale `file://`. |
| [Suite mirata finale](logs/muro-native-final-pytest.txt) | 84 passati, 5 skip di piattaforma. |
| [Giro adapter precedente](logs/muro-native-hosts-pytest.txt) | 44 passati, 3 skip; risultato precedente alla suite mirata finale. |
| [Follow-up offline interrotto](logs/muro-native-offline-pytest.txt) | Il file termina al 36%, senza riepilogo finale. Nessun esito complessivo attribuito. |
| [Tentativo OpenCode](opencode-blocked-attempt.json) e [log](logs/opencode.log) | Blocco locale `EACCES` prima del caricamento del plugin; non verifica il loader nativo. |

Il JSON della release v3 riassume 16 campi `stdout` più lunghi di 1.000
caratteri mediante lunghezza, byte UTF-8 e SHA-256. Mantiene comandi, exit code,
stderr, controlli e hash degli artefatti; registra anche hash e dimensione del
file originale. Non contiene il testo completo di quegli output.

[evidence-manifest.json](evidence-manifest.json) elenca origine, dimensione e
SHA-256 dei file archiviati. [native-package-results.json](native-package-results.json)
e [native-release-results.json](native-release-results.json) conservano anche
la preparazione degli input e la build v2 precedente, senza presentarle come
verifiche aggiuntive della v3.

Interpretazione, costi e limiti sono nel
[resoconto della consegna nativa](../2026-11-12-native-policy-delivery.md).
