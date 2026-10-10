# Guida per il medico

## Che cos'è Nutriplan
Nutriplan è un'applicazione web per creare **piani alimentari** personalizzati e seguire i pazienti nel tempo. Costruisci la dieta (pasti, alternative, quantità e sostituzioni equivalenti), la assegni al paziente e osservi come la segue: il paziente compila il proprio diario e registra il peso, tu vedi aderenza, andamento, visite e documenti in un'unica scheda.

Ogni medico lavora nel proprio spazio: vede solo i propri pazienti e le proprie diete. I piani si possono scaricare in PDF e i dati esportare in PDF o Excel; è disponibile un backup completo dei propri dati.


## Accesso e registrazione
- Accedi con le tue credenziali. Il login resta attivo anche dopo la chiusura del browser.
- Nuovi medici: **Sei un medico? Registrati** dalla pagina di login. L'account resta in attesa finché l'amministratore non lo attiva (oppure è l'amministratore a crearlo e darti una password temporanea).
- Ogni medico vede **solo i propri pazienti e le proprie diete**.

## Pazienti
**Pazienti** elenca i tuoi assistiti con ultimo peso, aderenza degli ultimi 7 giorni, pasti fuori dieta e giorni con il diario incompleto.

### Nuovo paziente
Premi **Nuovo paziente**, inserisci nome e (facoltativi) nome utente, email e password. Se non indichi nulla vengono generati automaticamente. Comunica al paziente la **password temporanea**: è monouso e dovrà sostituirla al primo accesso.

### Scheda paziente
Tab **Scheda**: anagrafica, altezza, peso obiettivo, allergie, intolleranze, patologie, farmaci, anamnesi, note riservate (il paziente non le vede) e **campi personalizzati** liberi. Da qui puoi anche **reimpostare la password** (nuova password monouso, le sessioni del paziente vengono chiuse), **disattivare** l'account o **eliminare** il paziente.

Se il paziente ha caricato la propria foto profilo, compare accanto al suo nome nell'elenco e nella scheda.

### Visite
Tab **Visite**: registra ogni controllo con data, peso, **girovita**, **lunghezza muscolo gamba**, **circonferenza polpaccio**, **circonferenza bicipite**, altre misure a piacere, note e allegati (foto e documenti). Le visite sono visibili al paziente in sola lettura nel suo Profilo; l'andamento delle misure compare nella pagina **Andamento**.

### Documenti, foto e ricette
Tab **Documenti**: carica file (max 15 MB) classificandoli come documento, foto o ricetta. Con **Condividi** li rendi visibili al paziente. I file caricati dal paziente compaiono qui, con l'etichetta «Caricato dal paziente».

## Diete
**Diete** elenca tutti i piani. Puoi **modificare**, **duplicare**, **assegnare**, scaricare il **PDF** o **eliminare**.

### Importare una dieta da PDF
Dalla pagina **Diete**, **Importa da PDF** carica `Franco.pdf` o `Giorgia.pdf`: la dieta già pronta viene creata come **modello** (non assegnata a nessun paziente) e si apre nell'editor. Il pulsante **Esempio PDF** scarica `Franco.pdf`, da usare come prova. Al momento sono riconosciuti solo questi due piani; altri PDF vengono rifiutati.

### Struttura di un piano
- **Pasti**: colazione, pranzo, cena… ognuno con orario e note. Un pasto può essere «uguale a» un altro (es. cena come pranzo). I pasti di tipo *extra* (olio, dolce…) sono facoltativi.
- **Alternative**: A, B, C… (con portata I/II e un eventuale massimo settimanale). Il paziente ne sceglie una. Un'alternativa «sempre inclusa» vale per tutte (es. contorno).
- **Alimenti**: nome, quantità, unità, testo libero e, se vuoi, il **gruppo di sostituzione** (l'asterisco \* del piano cartaceo).
- **Gruppi di sostituzione**: es. *Carne 200 g* con i suoi equivalenti (ricotta 120 g, pesce 220 g…). Le quantità proposte al paziente sono riproporzionate sulla quantità prevista.
- **Indicazioni e conversioni**: indicazioni generali e tabella crudo/cotto, stampate nel PDF.
- **Anteprima**: mostra il piano come lo vedrà il paziente.

Premi **Salva** per applicare le modifiche. Per non perdere la storia del diario, quando cambi piano nel tempo crea una nuova dieta con **Assegna** e data di inizio: la precedente viene chiusa il giorno prima.

### Avviso su allergie e patologie
Se il paziente ha allergie, intolleranze o patologie (inserite da te nella scheda o segnalate da lui dal Profilo), un **avviso rosso** resta sempre visibile mentre crei o modifichi la sua dieta, nella tab **Dieta** del paziente e quando assegni un piano. A ogni **salvataggio** e a ogni assegnazione ti viene chiesto di confermare di aver verificato la compatibilità.

### Assegnazione
Dal paziente (tab **Dieta**) o dall'elenco diete: scegli paziente, data di inizio/fine e se assegnare una **copia** (consigliato, il modello resta intatto) o **spostare** la dieta.

## Seguire i progressi
- **Andamento**: peso con obiettivo, aderenza giornaliera (come da dieta / fuori dieta / saltati / mancanti), riepilogo per 30 giorni, 3 mesi, 6 mesi o 1 anno. In fondo alla pagina scarica il **resoconto PDF o Excel** per un intervallo di date.
- **Diario**: calendario colorato e dettaglio di ogni giorno: alternativa scelta, sostituzioni, cosa è stato mangiato fuori dieta, note. Se il paziente ha modificato la quantità di un alimento, la variazione (previsto → effettivo) è **evidenziata** in ambra; il numero di pasti con quantità modificate compare in **Andamento** e nei resoconti PDF/Excel. Il medico consulta ma non modifica il diario.

## Contatti
Nel **Profilo** puoi inserire facoltativamente telefono, WhatsApp, Telegram, Instagram, Facebook e sito internet: i tuoi pazienti li vedranno nel loro profilo. Nella scheda del paziente trovi i suoi contatti come link cliccabili.

## Backup
**Backup** scarica uno ZIP con tutti i **tuoi** dati (pazienti, schede, documenti, diete, diario, pesi). **Ripristina** sostituisce i tuoi dati con quelli del file; i dati degli altri medici non vengono toccati. Un backup di un altro medico viene rifiutato.

## Profilo
Cambia password, email, tema chiaro/scuro e lingua IT/EN.
