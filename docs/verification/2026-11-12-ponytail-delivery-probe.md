# Ponytail: prova della consegna delle istruzioni — 12 novembre 2026

Questo documento conserva lo stato e i risultati della prova iniziale. La
successiva correzione della factory, richiesta dall'utente, è documentata in
[consegna nativa della policy](2026-11-12-native-policy-delivery.md). I limiti
implementativi descritti sotto non rappresentano più gli adapter corretti.

## Esito

Il nucleo comportamentale di Ponytail si presta a istruzioni sempre presenti: stabilire tutto lo scope, riusare ciò che esiste e realizzare la modifica minima **completa**, conservando controlli e funzionalità richieste. La review è invece una procedura su richiesta, con un rapporto come risultato.

Muro, nello stato del checkout esaminato, può rappresentare questa distinzione in `delivery.json`. Il pacchetto costruito contiene 1.800 caratteri di policy e una capacità `change-review`. **Il canale implementato è contesto iniziale, non un vero messaggio system.** La verifica della risposta del modello è rimasta bloccata dalle restrizioni dell'ambiente.

Questa è una prova delimitata a due file selezionati, non l'assorbimento completo di Ponytail in Marionette. Il lavoro della prova aggiunge solo questo resoconto e i suoi input a `docs/verification/`; non modifica factory, catalogo Marionette o configurazione degli host.

## Fonte verificata

- Repository: https://github.com/dietrichgebert/ponytail
- Ultima release stabile restituita dall'API durante la prova: [v5.3.3](https://github.com/DietrichGebert/ponytail/releases/tag/v5.3.3).
- Commit: `7801d061243d7b753bad0e0b3c057cd250b11755`.
- File selezionati: [regole centrali](https://github.com/DietrichGebert/ponytail/blob/7801d061243d7b753bad0e0b3c057cd250b11755/.agents/rules/ponytail.md) e [review](https://github.com/DietrichGebert/ponytail/blob/7801d061243d7b753bad0e0b3c057cd250b11755/skills/ponytail-review/SKILL.md).
- Licenza MIT verificata e inclusa nella release.

Il Git della shell non risolveva `github.com`. Il lettore GitHub ha fornito tag, commit firmato, albero e i tre blob necessari (i due file e LICENSE). La prova ha materializzato un database Git parziale locale verificando gli hash originali: commit, 57 alberi e 3 blob. Nessun nuovo commit è stato creato e nessun codice upstream è stato eseguito. Non è un clone completo né una prova di Git fetch HTTPS riuscito.

Blob: regole `b314fa6ea92e5ee4f3557f374e9d64213c95bb61`; review `a50e3ac6ded6fccc9edae34ce37877bbce11e3fa`; LICENSE `715d483338cea4365f0d91a27799cf61226d6bcf`.

## Decisione dell'IA

| Parte | Forma | Motivo |
|---|---|---|
| Scope prima della minimizzazione, riuso, completezza e salvaguardie | `always-on` | Guida il modo di lavorare prima della scelta di una procedura; non produce un risultato separato. |
| Review di diff e codice collegato | `capability` | Richiede un rapporto specifico, con evidenze, senza modificare codice. |
| Identità del “lazy senior”, chiusure obbligatorie, inglese imposto | `dropped` | Il metodo resta utile senza cambiare identità dell'host o lingua richiesta dall'utente. |

La decisione e il testo sono stati scritti dall'IA, letti contro le fonti e verificati da una seconda analisi; Python ha controllato struttura, riferimenti e confezionamento. Non esiste una classificazione per nome o parole chiave.

La policy mantiene le clausole sul codice condizionate all'effettivo lavoro sul codice. In un pacchetto multidominio non deve prevalere su design approvati, motori richiesti dalle capacità o richieste complete dell'utente. Per armonizzarla realmente con tutto Marionette resta da leggere e confrontare il suo catalogo completo: la prova isolata non dimostra quella compatibilità.

## Canale effettivo per host

| Host | Cosa genera Muro oggi | Verifica ottenuta |
|---|---|---|
| Claude Code | Hook `SessionStart`, matcher `startup|clear|compact`, che esegue `muro.py session-context` | Manifest presente; due esecuzioni standalone corrette; host reale carica plugin e due skill, ma l'hook fallisce prima dell'esecuzione. |
| Codex | Testo nel pacchetto e istruzione manuale in INSTALL.md | Due esecuzioni standalone corrette; nessuna registrazione automatica. |
| Pi | Come Codex | Due esecuzioni standalone corrette. |
| OpenCode | Come Codex | Due esecuzioni standalone corrette. |
| Hermes | Come Codex | Due esecuzioni standalone corrette. |

La [documentazione Claude Code](https://code.claude.com/docs/en/hooks) distingue il contesto aggiunto da SessionStart dal system prompt. Il CLI offre un canale esplicito di append al system prompt, ma Muro non genera attualmente un launcher che lo utilizzi. Il matcher di Muro non include resume e non propaga automaticamente la policy a SubagentStart; quei flussi non sono stati provati.

Un pacchetto composto soltanto da istruzioni always-on, senza capacità, è inoltre respinto dalla validazione corrente (`no capabilities provided`). Nella prova la review è una capacità reale, non un espediente vuoto.

## Comandi e risultati

Manifest eseguito: `D:/workspace/muro-ponytail-probe/package/sources.json`. Release nuova: `D:/workspace/muro-ponytail-probe/release/ponytail-probe`.

| Comando / verifica | Risultato |
|---|---|
| `--prepare-intake ponytail`, prima e seconda esecuzione | OK; preparazione ripetibile. L'intake semantico resta quello svolto dall'IA. |
| `--harmonize` | OK; prompt preparato e decisione documentata sopra. |
| `--validate` sul probe | OK |
| `--check-sources` sul probe | OK sul database Git locale con hash upstream verificati |
| `--build --out D:/workspace/muro-ponytail-probe/release` | OK; output nuovo, nessuna dist esistente sostituita |
| Launcher dei cinque adapter, da un progetto esterno, due volte ciascuno | 10/10 restituiscono esattamente la policy |
| GUIDE.html, LICENSES, rinomina SKILL.source.md | Presenti; nessun originale SKILL.md registrabile sotto scripts |
| `--prepare-eval` e `--score-eval` | 4/4; decisioni di un secondo agente, senza lettura delle aspettative |
| `python -m pytest -q tests/test_delivery.py -k "not marionette"` | 32 passati, 1 escluso, 17,81 s |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | OK |
| `python -m pytest -q` | 316 passati, 13 falliti, 2 errori, 258,90 s |

L'eval comprende una review di regressioni, una review di astrazioni inutili, una richiesta di implementazione che nega esplicitamente la review e una revisione di un invito personale. Le ultime due restituiscono no_match: la policy non introduce un fallback verso la review. È un controllo dell'IA su quattro casi, non un benchmark indipendente di efficacia o una prova in Claude Code.

La suite completa **non è verde**. Tre fallimenti e i due errori riguardano fetch HTTPS bloccati dal DNS. Otto fallimenti riguardano il trasporto Git `file://` nei percorsi temporanei di questa sandbox. Restano due incoerenze del checkout già in lavorazione: `examples/marionette/delivery.json` manca, e il test dell'elenco delle fonti non include `claude-design-system-prompt`, presente nel manifest durante l'esecuzione. Questi problemi non sono stati corretti dalla prova.

## Tentativo nell'host reale

Una sola sessione Claude Code, con plugin temporaneo `--plugin-dir`, configurazioni ordinarie escluse tramite `--setting-sources ""`, `--permission-mode dontAsk`, budget massimo di 1 USD, nessuna persistenza e richiesta di descrivere soltanto la policy già ricevuta. Nessun testo della policy è stato inserito nella richiesta.

Il log verifica:
- plugin `ponytail-probe` caricato e due skill lette;
- manifest dell'hook riconosciuto;
- hook non avviato: EPERM nel creare la cartella dati del plugin sotto `~/.claude/plugins/data/`;
- API irraggiungibile: ENOTFOUND per `api.anthropic.com`;
- sessione interrotta dal limite di 80 s (83,74 s misurati dal runner).

Nessuna risposta del modello, nessun elenco delle skill prodotto dal modello, nessuna prova dell'adesione comportamentale. Usage e costo effettivo non restituiti: non vengono dichiarati zero. Non è stata richiesta un'esecuzione fuori sandbox né modificata la configurazione dell'utente.

## Costi e limiti da risolvere

La policy costa 1.800 caratteri di contesto a startup/clear/compact e un processo Python per emissione; l'hook non compie chiamate modello aggiuntive. Il numero esatto di token dipende dal tokenizer. La review aggiunge il protocollo di classificazione solo quando richiesta.

La versione di `delivery.py` e dei relativi test era già non committata all'inizio. Al primo controllo le istruzioni AGENTS/README sui hook passivi e la nuova policy locale sulla registrazione automatica non erano coerenti, e ADR-0016, citato nei test, era assente. Al controllo finale sono comparse modifiche concorrenti ad AGENTS, README, prompt e ADR, incluso ADR-0016: questo rilievo iniziale non descrive quindi necessariamente il loro stato finale. La prova documenta il pacchetto costruito e i risultati osservati, non certifica le modifiche concorrenti successive. La prova autorizza il solo caricamento temporaneo richiesto dall'utente.

Per soddisfare “come system prompt” letteralmente occorre dichiarare separatamente il canale di istruzioni supportato da ogni host e provarne la consegna reale; per ottenere il comportamento sempre attivo occorre almeno completare gli altri adapter e verificare secondo turno, resume, compaction e subagenti. Nessuna di queste proprietà va dedotta dal successo della build.

Sono fuori dal probe le altre skill Ponytail, i livelli di modalità, repository map, statusline, band/ledger e hook upstream. L'ispezione separata ha rilevato scritture di stato e un ledger locale nella configurazione upstream; non sono stati attivati.

## Input conservati

[delivery.json](ponytail-probe/delivery.json) contiene la policy e i motivi. [ROUTER.md](ponytail-probe/ROUTER.md), [capability](ponytail-probe/capabilities/change-review.md), esempi, entry, eval e risultati sono nella stessa cartella.

[sources.json](ponytail-probe/sources.json) usa il repository HTTPS per riprodurre la prova in un ambiente con rete; [sources.executed.json](ponytail-probe/sources.executed.json) conserva il manifest eseguito con il database locale parziale. Il secondo richiede quel database, non incluso nel repository. Nessun file generato della release viene modificato a mano.
