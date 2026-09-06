# RICERCA.md — trovare un professionista su Bob

**Che cosa è questo documento.** Le decisioni prese sulla ricerca per parole
chiave e sull'ordine in cui compaiono i professionisti: che cosa abbiamo scelto
e *perché*. È autorevole sull'INTENTO, mai sullo stato — per sapere che cosa
esiste davvero si guardano `origin/main`, lo schema vivo su Supabase e le
risposte della produzione, come dice la regola del progetto. L'ultima sezione
dà una fotografia datata, e invecchia dal giorno dopo.

**A chi serve.** A chi tocca la ricerca dopo di noi, e a chi deve rispondere
alla domanda «come fate a decidere chi viene prima?» — che è una domanda di
prodotto, ma anche un obbligo di legge (§5).

Rimandi: `docs/DATA_COMPLIANCE.md` §2 per l'AI e l'art. 22, §5 per la
conservazione. `SEO.md` per i volumi di ricerca che giustificano le scelte.

---

## 1. Il problema

Chi cerca un servizio ha sempre avuto due strade: **chiedere a Bob**, oppure
**scorrere l'elenco** con due tendine (città e servizio). Manca la terza, che è
quella che la gente usa dappertutto: **scrivere quello che le serve**.

Le due tendine chiedono al cliente un lavoro che dovremmo fare noi: sapere in
quale delle quindici categorie sta il suo problema. Chi ha un rubinetto che
perde non pensa «idraulico», pensa «rubinetto che perde».

Le parole, però, il catalogo le ha già: **15 servizi e 120 interventi**. Quello
che mancava era il ponte fra come parla il cliente e come si chiama la voce.

## 2. Le tre parti

| | che cos'è | dove vive |
|---|---|---|
| **Vocabolario** | come si scrive una cosa → a quale voce di catalogo porta | `search_terms` (mig. 067) |
| **Risolutore** | una frase → il luogo + i punti di catalogo, con un punteggio | `search_resolve()` (mig. 068-069), `src/lib/search.ts` |
| **Ranking** | dato un punto di catalogo → in che ordine mostrare i professionisti | §4 |

Sono separate di proposito. Il vocabolario si può correggere senza toccare il
codice; il risolutore si può cambiare senza rifare il ranking; il ranking si
può ritarare senza rimettere mano al vocabolario.

## 3. Il vocabolario e il risolutore

### Come cresce il vocabolario

I **nomi ufficiali** si generano dal catalogo stesso: aggiungere un intervento
in admin e rigiocare i due `insert` della 067 lo rende cercabile. Non c'è una
lista da tenere allineata a mano.

I **sinonimi** sono scritti come li scrive un cliente («rubinetto che perde»,
non «perdita rubinetto o sifone») e si aggiungono da `/admin/catalogo`, senza
deploy. La fonte da cui crescono è il **registro delle ricerche a vuoto**: le
frasi che non hanno trovato niente sono, letteralmente, la lista dei sinonimi
che mancano.

Le voci «Altro (…)» restano fuori dal vocabolario di proposito: sono la casella
di ripiego di un modulo, non qualcosa che una persona cerca.

### I quattro modi di somigliare

| fiducia | come | esempio |
|---|---|---|
| 1.00 | la frase È un termine | `scarico otturato` |
| 0.85 | un termine sta dentro la frase, parola intera | `mi si è otturato lo scarico` |
| 0.80 | un termine comincia con quello che ho battuto | `idra` → Idraulico |
| 0.40–0.99 | somiglianza: trigrammi, o quante parole piene tornano | `zanzarire`, `rubinetti` |

Sotto 0.40 non si risponde. Con due o più parole piene, almeno una deve essere
in comune: senza quella regola la somiglianza cieca, su una frase lunga,
inventa parentele.

A parità di banda (0.05) vince prima la corrispondenza esatta, poi
**l'intervento sul mestiere**: chi scrive «pulizie fine locazione» ha già detto
il mestiere e ha aggiunto il lavoro, e portarlo su «Pulizie» butta via proprio
l'informazione in più.

### Le bande di fiducia sono un obbligo dell'interfaccia

- **≥ 0.80** → è una risposta. Si possono mostrare i risultati.
- **0.40–0.80** → è un «forse cercavi». Va detto, non affermato.
- **< 0.40** → non si è capito. Si mostra il ripiego onesto (il mestiere padre,
  con l'etichetta che dice che quell'intervento non è dichiarato) e Bob.

Non è una raffinatezza. Esempio vero: «ho bisogno di un preventivo per il
bagno» dà due candidati a 0.45 che con la frase hanno in comune una parola
sola, «bagno». Fra i due non decide il senso, decide l'alfabeto. A quel livello
proporre è onesto, affermare no.

**L'ordine in cui arrivano i match non è per punteggio** (è per banda). Chi li
riordina per `score` disfa la 069.

## 4. In che ordine compaiono i professionisti

Il punteggio è **deterministico e pubblicato**. Nessun apprendimento, nessuna
personalizzazione, nessun LLM che decide l'ordine: tre cose che renderebbero
impossibile rispondere a un professionista che chiede perché è settimo.

| criterio | punti | perché |
|---|---|---|
| intervento esatto dichiarato | 40 | è la domanda che il cliente ha fatto |
| solo il mestiere padre | 20 | pertinente, ma non è quello che ha chiesto |
| nessuna corrispondenza | escluso | |
| area: zona / città / provincia / regione / Italia | 25 / 18 / 10 / 6 / 3 | chi è vicino serve meglio; chi copre l'Italia deve comparire, non vincere |
| verifica: Pro+ / verificato / in corso | 15 / 10 / 2 | M4 dice che il livello deve pesare in modo visibile |
| valutazione | fino a 12 | vedi sotto |
| prezzo più basso | fino a 5 | una spinta, mai la decisione |
| prenotazione immediata con slot nella settimana | 5 | è disponibilità vera, non una promessa |

**La valutazione si smorza:** `12 × (media/5) × (n/(n+5))`. Con 14 recensioni in
tutta la piattaforma, una media 5,0 su due voti non può battere una 4,8 su
venti. Senza lo smorzamento il ranking premierebbe chi ha poche recensioni
fortunate, che è il modo più veloce per rendere il punteggio non credibile.

**A parità di punteggio si sorteggia**, con un seme che cambia ogni giorno e
non a ogni richiesta (così la pagina è stabile per chi la ricarica). Con sei
professionisti, senza sorteggio chi ha il nome fortunato prenderebbe tutti i
contatti per sempre.

**Che cosa NON entra nel punteggio**, e resta fuori finché non è scritto qui:
comportamento del singolo cliente, cronologia delle sue ricerche, qualunque
profilazione. Il ranking è uguale per tutti.

### Dove sono dichiarati, e perché basta un link

I parametri stanno in **una sezione sola**, `/come-funziona#ordine`, e da ogni
elenco di professionisti ci si arriva col link «Come ordiniamo i risultati»
(`src/components/ComeOrdiniamo.tsx`).

Non è una scorciatoia: l'**art. 22 comma 4-bis del Codice del Consumo** — che
recepisce l'art. 7(4-bis) della direttiva 2005/29 — chiede esattamente «una
sezione specifica dell'interfaccia online, **direttamente e facilmente
accessibile dalla pagina in cui sono presentati i risultati**». Il link È il
meccanismo che la norma descrive, a tre condizioni: la sezione esiste davvero,
si raggiunge *da dove si vedono i risultati* (non solo dal fondo del sito), e
l'etichetta dice di che si tratta.

Un componente e non quattro righe uguali, perché il giorno in cui il modo di
ordinare cambia va cambiato dappertutto insieme: quattro copie a mano sono
quattro occasioni per dimenticarne una, e una pagina rimasta indietro dichiara
il falso.

**La sezione descrive il codice di OGGI, non i pesi di questo documento.** Oggi
`getProfessionals` ordina per precisione dell'area, verifica, valutazione,
tariffa. Quando il ranking passa in SQL coi pesi della tabella qui sopra, la
sezione si aggiorna *nello stesso commit*.

Com'era prima, per memoria: la dichiarazione stava scritta in pagina solo su
servizio×città, e **ne dimenticava il primo criterio** — la precisione
dell'area, che dalla 057/058 è quello che pesa di più. Le altre tre pagine di
elenco non dichiaravano niente.

### Perché questo resta fuori dall'art. 22

Il punteggio è una formula pubblicata, non una decisione automatizzata su una
persona: non sospende, non esclude e non declassa nessun professionista. Se un
domani il posizionamento dovesse *penalizzare* qualcuno per il suo
comportamento, quella diventa un'altra cosa e serve l'uomo nel processo
(`DATA_COMPLIANCE.md` §2). Un eventuale ripiego su Bob per interpretare la
frase **non decide l'ordine** e va etichettato come AI (AI Act art. 50).

## 5. Le posizioni a pagamento

**La regola.** Al massimo **uno slot fra i primi tre e uno a metà elenco**,
marcati **«Sponsorizzato»**, scelti fra i professionisti con un piano a
pagamento e ordinati fra loro per pertinenza. **L'elenco organico non si tocca:
restano tutti lì, nello stesso ordine che avrebbero avuto.** Un professionista
che paga compare *in più*, non *al posto di*.

**Perché slot etichettati e non punti in più.** Un bonus dentro il punteggio
mescola merito e pagamento in un numero solo, e il cliente non può sapere quale
risultato ha pagato per stare lì. Con lo slot etichettato lo sa leggendo.

**La disclosure è obbligatoria, non facoltativa.**

- Dir. 2005/29/CE, All. I punto 11-bis (recepito in **art. 22 c. 4-bis Codice
  del Consumo**): presentare un risultato di ricerca senza dire che il
  posizionamento è a pagamento è una pratica sleale **in sé**.
- **Reg. UE 2019/1150 (P2B) art. 5**: verso i professionisti vanno dichiarati i
  parametri principali e se e come un pagamento li influenza.

**Attenzione a una riga che oggi è vera e domani non lo sarà.** La sezione
`/come-funziona#ordine` dichiara «**Nessuna posizione è a pagamento**». Il
giorno del primo slot sponsorizzato quella riga diventa falsa su una pagina
pubblica: va **sostituita, non tolta**. Ora sta in un posto solo, quindi è una
modifica sola — prima erano quattro pagine da ricordare.

**Il link però non copre il pagamento.** L'allegato I punto 11-bis è una
pratica sleale *in sé* e pretende la dichiarazione **dentro i risultati**:
l'etichetta «Sponsorizzato» va sulla scheda, dove la persona sta guardando.
Nessun rimando la sostituisce. Quindi il giorno degli slot cambiano due cose:

1. la scheda sponsorizzata prende l'etichetta — obbligatoria, visibile, non
   rimandabile;
2. la sezione dice che esistono spazi a pagamento, come sono scelti, e che non
   cambiano l'ordine degli altri.

I termini per i professionisti (§9 di `/termini/professionisti`) **lo
promettono già**: «il posizionamento a pagamento è chiaramente identificato
come tale ai clienti». L'etichetta non è una scelta di prodotto ancora aperta,
è una promessa già firmata.

Quegli stessi termini però elencano fra i criteri anche cose che il ranking
**non usa**: reattività nelle risposte, completamento dei lavori sulla
piattaforma, completezza del profilo. Dichiarare parametri che non esistono è
l'errore opposto a quello che abbiamo appena corretto. Da sfoltire al prossimo
`TERMS_VERSION` — che è un cambio sostanziale e tocca ciò che gli utenti hanno
accettato, quindi va fatto di proposito e non di sfuggita.

## 6. Che cosa dichiara un professionista

**`professional_services` è la verità** (mig. 070): una riga per intervento
offerto, col suo prezzo, la sua unità di misura e la prenotazione immediata.
`professionals.subservice_slugs` è deprecata e la eliminerà la 071 — ma **solo
dopo** che il codice ha smesso di leggerla, perché Vercel pubblica `main` da sé
mentre le migrazioni passano da Supabase a mano.

Il prezzo può mancare: dichiarare dodici lavori non deve obbligare a fissare
dodici prezzi. Un intervento senza prezzo è pertinente lo stesso — semplicemente
non prende i punti del prezzo.

Una riga con `subservice_id` NULL vuol dire «il mestiere, nessun intervento
specifico»: la crea l'iscrizione, ed è la ragione per cui esiste il punteggio
20 «solo mestiere».

## 7. Che cosa si registra delle ricerche, e che cosa no

Una casella di ricerca raccoglie dati personali che nessuno ha chiesto: le
persone ci scrivono indirizzi e numeri di telefono. Quindi:

- **niente `user_id`**, come già per `search_events` dalla 026;
- si registra la **frase normalizzata**, con le **cifre tolte** e un tetto di
  **60 caratteri** — abbastanza per capire che manca il sinonimo «bagno», non
  abbastanza per conservare una via e un civico;
- **conservazione 12 mesi** (dato di prospect, `DATA_COMPLIANCE.md` §5);
- riga nel registro dei trattamenti, RLS attiva, lettura al solo staff.

Lo scopo è uno solo e va scritto: **far crescere il vocabolario**. Non è
analytics di prodotto e non diventa un profilo di nessuno.

## 8. Come si verifica

Non basta leggere il codice — su questo progetto l'ordine delle rotte ha già
sorpreso due volte.

1. Un mazzo di frasi vere contro `search_resolve`, coi luoghi dentro: esatto,
   prefisso, refuso, ordine invertito, zona con due nomi nell'etichetta,
   «vicino a me», solo-luogo, sola punteggiatura.
2. La catena intera: frase → intervento → **professionisti veri**. È l'unica
   prova che conta, e va rifatta dopo ogni cambio al vocabolario.
3. `scripts/schema_check.sh` (replay dai soli file) e gli advisor di sicurezza
   dopo ogni migrazione.
4. Dal vivo su www.meetonda.com, desktop **e 390px**.

## 9. Stato al 5 settembre 2026 — fotografia, non verità

Invecchia dal giorno dopo: la verità è il repo, lo schema vivo e la produzione.

**C'è**: vocabolario (491 termini, tutti e 105 gli interventi non-«Altro»
coperti); risolutore con bande e ordinamento per specificità;
`professional_services` come verità unica con l'unione già fatta; la casella di
ricerca su `/professionisti`, con i suggerimenti mentre si scrive, la pastiglia
che mostra come ha capito e le tre bande rispettate; il primo criterio del
ranking — chi ha dichiarato l'intervento cercato viene prima di chi non l'ha
dichiarato, e la scheda lo dice a entrambi.

**Non c'è**: il resto del ranking coi pesi di §4 — `getProfessionals` carica
ancora tutti i professionisti e ordina in JavaScript, e il criterio
dell'intervento è un raggruppamento (prima chi lo dichiara), non ancora un
punteggio; gli slot sponsorizzati; il registro delle ricerche a vuoto; la
schermata che chiede al professionista i suoi interventi; il `drop column`
della 071.

**Il limite vero non è il codice, è il dato**: quattro professionisti su sei
non dichiaravano nessun intervento prima della 070, e «scarico otturato»
oggi non trova nessuno perché nessuno l'ha dichiarato — non perché la ricerca
non funzioni. Adesso che l'intervento dichiarato decide il primo posto, il
valore di quella schermata è salito: è quella che riempie il dato su cui il
ranking si regge.
