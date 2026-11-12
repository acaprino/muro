# Consegna nativa delle policy - 12 novembre 2026

## Obiettivo e perimetro

Dopo la [prova Ponytail](2026-11-12-ponytail-delivery-probe.md), l'utente ha
chiesto «Allora va ficxato» e «aggiorna specifiche e documentazione».
La correzione riguarda la factory: una decisione `always-on` deve produrre
istruzioni permanenti nel canale nativo dell'host. Non aggiunge l'intero
Ponytail al catalogo Marionette e non installa plugin nelle configurazioni
dell'utente. L'IA continua a decidere la forma e lo scope; Python li valida.

La prova seleziona sempre le regole centrali e la review di Ponytail v5.3.3,
commit `7801d061243d7b753bad0e0b3c057cd250b11755`. I 1.800 caratteri di policy
restano identici; le ragioni della consegna vengono aggiornate per descrivere
i canali corretti. La prova precedente e i suoi input restano storici.

## Comportamento implementato

| Host | Consegna della policy | Verifica e limite |
|---|---|---|
| Claude Code | Modulo `prompt.compose`, sezione system aggiuntiva con ID del pacchetto | Validazione e composizione nell'host installato 2.1.322. Le sezioni native e lo stile dell'utente restano. Nessuna chiamata al modello. |
| Codex | Hook SessionStart/SubagentStart, JSON `additionalContext` nel canale developer | Comandi generati eseguiti da directory esterna; verificati matcher startup/resume/clear/compact/fork e contesto dei due eventi. Il consumo in una conversazione reale non è verificato. |
| Pi | Estensione `before_agent_start`, sezione nominata in `systemPromptOptions.sections` | Loader, ExtensionRunner e renderer reali di Pi 1.4.0. Seconda esecuzione senza duplicazioni o differenze di prompt. Nessuna conversazione/modello. |
| OpenCode | Package plugin V2, hook system context/compaction/generate/title e registrazione delle skill | Fixture eseguibili del confine nativo; i messaggi dell'utente restano invariati. Il livello aggiuntivo di verifica dell'host è riportato nei risultati sotto. |
| Hermes | Plugin nativo, `register_system_prompt_section` dopo la memoria | PluginContext/PluginManager reali di Hermes 0.23.1, incluse identità lunghe. Nessuna conversazione/modello. |

Occorre caricare l'adapter completo. Copiare soltanto le cartelle delle skill
non attiva la policy. Permessi, trust e feature dell'host restano autorevoli.
Claude richiede mods (2.1.287+); Pi l'API delle sezioni strutturate; OpenCode
l'API package V2; Hermes la registrazione delle sezioni. Un Hermes precedente
emette un avviso esplicito e conserva le skill disponibili.

Un resume Hermes può ripristinare il prompt salvato: dopo un aggiornamento
della policy serve una nuova sessione. Non viene dichiarato un aggiornamento
retroattivo. In Claude `scope: session` riguarda la cache: non dimostra la
consegna a ogni possibile subagente personalizzato.

## Correzioni correlate e regressioni

- Un pacchetto composto soltanto da policy è valido con router senza righe,
  esempi `no_match`, nessuna capability e nessun `SKILL.md` scopribile. Senza
  una dichiarazione valida non si indebolisce la validazione del catalogo.
- Il digest incorpora tutto `delivery.json`. Runtime, guida ed eval condividono
  il binding; decisioni o mappe precedenti a una modifica della policy sono
  rifiutate senza alterarne le evidenze. L'eval riceve il testo esatto.
- Codex riceve un envelope JSON specifico dell'evento. Policy che iniziano con
  `{` o `[` restano testo; non diventano comandi di controllo dell'hook. Il
  comando `session-context` senza opzioni resta disponibile per ispezione.
- Gli argomenti degli hook viaggiano come dati JSON codificati in base64. Un
  trampoline Python risolve il plugin root e invoca il programma con
  `shell=False`. Test reali in cmd e PowerShell coprono spazi, Unicode, newline,
  virgolette, dollari, backtick, stdin, stderr ed exit status.
- I programmi Windows `.cmd`/`.bat` sono rifiutati: una regressione ha dimostrato
  che Windows li passa a cmd anche con `shell=False`. Occorre dichiarare
  l'eseguibile e lo script sottostante. Non vengono interpretati comandi shell
  impliciti.
- Hermes limita gli ID di sezione a 128 caratteri. Le identità lunghe hanno
  un prefisso leggibile e SHA-256 deterministico; i nomi brevi restano uguali.

Prima delle correzioni: envelope Codex **4 test falliti**; binding policy
**3 falliti, 1 passato**; comando letterale **6 falliti, 3 skip di piattaforma**;
batch Windows **4 regressioni riprodotte**; ID lungo Hermes **1 fallito**.
Questi sono difetti meccanici riprodotti, non valutazioni della qualità dell'IA.

## Verifiche

Il checkout contiene anche modifiche concorrenti al catalogo Marionette.
I risultati della suite completa riguardano quel checkout complessivo; la
prova isolata usa il proprio manifest e la propria release, con slug diverso
da `muro`. Il primo giro completo usa `--basetemp` sotto `D:/workspace`.
La verifica successiva sposta anche `TEMP` e `TMP` in una directory scratch
consentita; il problema del trasporto Git `file://` persiste. Non è quindi
attribuibile al solo nome del percorso temporaneo. Codice e impostazioni Git
non sono stati cambiati per mascherare questi fallimenti.

| Verifica | Risultato |
|---|---|
| Suite mirata finale: delivery, quattro file di adapter, policy-only, binding e argv | **84 passati, 5 skip di piattaforma**, 112,31 s; API Pi/Hermes installate abilitate esplicitamente. |
| Binding, guida, lezioni/eval e routing IA | **80 passati**, 39,50 s. |
| Suite completa, primo giro | **372 passati, 13 falliti, 5 skip, 3 errori**, 355,96 s. |
| Ripetizione pin, regressioni e descrizione discovery con TEMP/TMP dedicati | **40 passati, 8 falliti**, 44,10 s. Restano solo i test del trasporto Git `file://`; i due assert sul catalogo concorrente ora passano. |
| `--validate` Marionette | OK. |
| `--check-sources` Marionette | Bloccato: le 11 fonti HTTPS non risolvono `github.com`. |
| Build Marionette in nuova directory | Bloccata sul primo fetch HTTPS (`taste-skill`); nessuna release riuscita dichiarata. |
| Compilazione Python, JSON FRD e `git diff --check` | OK. |

Nel primo giro completo, tre fallimenti e tre errori dipendono dai fetch HTTPS;
otto fallimenti dal trasporto Git locale `file://`; due
assert riguardano descrizione/elenco fonti Marionette modificati parallelamente
durante la suite. Non sono stati corretti cambiando il significato del catalogo
per questa integrazione. Le ripetizioni locali e il probe finale sono riportati
con i rispettivi risultati, separati dal primo giro.

Il tentativo OpenCode reale usa `plugin list --standalone`, configurazione e
directory XDG isolate, credenziali provider non ereditate, fetch modelli e
aggiornamenti disabilitati. Il server avvia il database temporaneo ma la
connessione CLI/server locale fallisce con `EACCES` prima del caricamento del
plugin. Il processo è stato fermato; il controllo successivo vede zero processi
OpenCode. Non è stata tentata un'altra modalità per superare il blocco. Questo
non convalida il loader: la consegna OpenCode rimane verificata con fixture.

## Costi e limiti

La policy costa 1.800 caratteri nei prompt che la ricevono; il numero di token
e la fatturazione della cache dipendono dall'host/modello. Claude, Pi, OpenCode
e Hermes la registrano senza avviare un processo per ogni consegna. Codex
avvia un trampoline Python e il launcher per ogni evento pertinente. Gli hook
di sorgente aggiungono il trampoline al comando dichiarato.

Questi meccanismi non effettuano chiamate modello aggiuntive. Le verifiche
offline non fatturano inferenze. Il tentativo OpenCode ha incontrato il blocco
locale `EACCES` descritto sopra; non sono state usate deroghe ai permessi.
Il precedente tentativo Claude con API irraggiungibile resta documentato a
parte: usage e costo non restituiti, quindi non dichiarati zero.

Nessuna prova misura l'adesione comportamentale del modello. Le chiamate
successive e la deduplicazione sono verificate ai confini dichiarati; non sono
un test end-to-end di tutte le combinazioni resume/compaction/subagenti su
tutti gli host. Gli hook upstream Ponytail restano esclusi e inerti.

## Specifiche aggiornate

[ADR-0016 v2](../adr/ADR-0016-delivery-form-and-self-registering-releases.md)
descrive il contratto corrente e mantiene la prima mappatura come storica.
[FRD-0001 v4](../frd/FRD-0001-muro-factory-and-coordinator.json) contiene 18
requisiti, inclusi policy-only, consegna nativa e trasporto letterale degli hook.
README, AGENTS, prompt delivery/intake/harmonizer e protocollo di preparazione
sono allineati. Gli indici generati non sono riscritti a mano: note esterne
segnalano le versioni correnti perché i generatori non sono disponibili.

Non sono stati eseguiti commit, push, installazioni del plugin o sostituzioni
di dist esistenti. Le release di verifica sono nuove directory temporanee.

## Evidenze finali conservate

La release nativa v3 ha completato **54 controlli su 54**, con **18 comandi
terminati con exit code 0**; l'eval sul medesimo pacchetto ha ottenuto
**4 casi su 4**. Il digest eval è
`36bf03d2d99ea009584529b06ba5d4ed5cc019f9445bd6108a6b466c327509c4`.
Sono risultati di verifica degli artefatti e delle decisioni riportate, non
una misura dell'adesione comportamentale di un modello in conversazione.

L'[archivio della prova nativa](ponytail-native/README.md) contiene gli input
del pacchetto, il [manifest HTTPS](ponytail-native/sources.json), il
[manifest locale eseguito](ponytail-native/sources.executed.json), i
[risultati della release v3](ponytail-native/native-release-v3-results.json)
e l'intero set di [contesti](ponytail-native/native-eval-v3/contexts/contexts.json),
[decisioni](ponytail-native/native-eval-v3/decisions.json) e
[risultati eval](ponytail-native/native-eval-v3/results.json). Il mirror Git
locale non è incluso; il manifest HTTPS non documenta un fetch riuscito in
questa sessione. I 16 stdout lunghi della release sono sostituiti da
lunghezza e SHA-256, mantenendo tutti i controlli, exit code e hash originali.

I log preservano separatamente il
[primo giro completo](ponytail-native/logs/muro-native-full-pytest.txt)
(372 passati, 13 falliti, 5 skip, 3 errori), il
[follow-up sorgenti](ponytail-native/logs/muro-native-source-followup.txt)
(40 passati, 8 falliti per il trasporto `file://`) e la
[suite mirata finale](ponytail-native/logs/muro-native-final-pytest.txt)
(84 passati, 5 skip). Il
[giro adapter precedente](ponytail-native/logs/muro-native-hosts-pytest.txt)
riporta 44 passati e 3 skip; non sostituisce il risultato finale.

Il [follow-up offline rimasto interrotto](ponytail-native/logs/muro-native-offline-pytest.txt)
termina con il progresso al **36%**, senza riepilogo o risultato finale.
Non viene dichiarato completato o riuscito e non è stato rieseguito durante
questa raccolta. Il [tentativo OpenCode bloccato](ponytail-native/opencode-blocked-attempt.json)
e il suo [log](ponytail-native/logs/opencode.log) confermano il limite `EACCES`
già descritto. La raccolta non ha eseguito nuovi test, build o sessioni host;
la prova storica `ponytail-probe` è rimasta invariata.
