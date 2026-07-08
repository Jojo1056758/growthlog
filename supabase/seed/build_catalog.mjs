// Build-Skript: erzeugt aus der Quelldatei der 250 Vokabeln
//   1) supabase/seed/words_catalog.json  (kanonischer Datensatz, 250 Einträge)
//   2) supabase/seed/003_seed_word_queue.sql (INSERT aller 250 in word_queue)
//
// Aufruf:
//   node supabase/seed/build_catalog.mjs <pfad-zur-quell-json>
//
// Reine Aufbereitung – keine KI-API. Erste Erklärung/erster Beispielsatz stammen
// unverändert aus der Quelldatei. Kategorie (auf 10 Hauptkategorien) sowie – für
// den balancierten Aktivierungssatz – zweite Erklärung und zweiter Beispielsatz
// sind hier redaktionell hinterlegt.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN = {
  PHIL: "Philosophie und Erkenntnistheorie",
  PSYCH: "Psychologie und Verhalten",
  SPRACHE: "Sprache und Rhetorik",
  LOGIK: "Logik und Argumentation",
  WISS: "Wissenschaft und Forschung",
  POLITIK: "Politik und Gesellschaft",
  WIRT: "Wirtschaft und Organisation",
  KULTUR: "Kultur und Geschichte",
  RECHT: "Recht und Ethik",
  BILDUNG: "Allgemeine Bildungssprache",
};

// Standard-Zuordnung je Quell-Kategorie (Fallback für nicht angereicherte Wörter).
const SRC_DEFAULT = {
  "Erkenntnis & Wissenschaft": MAIN.PHIL,
  "Logik & Argumentation": MAIN.LOGIK,
  "Psychologie & Verhalten": MAIN.PSYCH,
  "Gesellschaft & Politik": MAIN.POLITIK,
  "Sprache & Rhetorik": MAIN.SPRACHE,
  "Abstrakte Bildungssprache": MAIN.BILDUNG,
};

// Explizite Kategorie-Überschreibungen (Wort -> Hauptkategorie), damit alle zehn
// Hauptkategorien tatsächlich besetzt sind und Begriffe fachlich passend liegen.
const CAT_OVERRIDE = {
  // Wissenschaft und Forschung (Methodik/Statistik aus "Erkenntnis & Wissenschaft")
  Evidenz: MAIN.WISS, Extrapolation: MAIN.WISS, Falsifikation: MAIN.WISS,
  Algorithmik: MAIN.WISS, Kausalität: MAIN.WISS, Konstrukt: MAIN.WISS,
  Korrelation: MAIN.WISS, Methodologie: MAIN.WISS, Operationalisierung: MAIN.WISS,
  Replikation: MAIN.WISS, Trennschärfe: MAIN.WISS, Reliabilität: MAIN.WISS,
  Verifikation: MAIN.WISS, Varianz: MAIN.WISS, Prognostik: MAIN.WISS,
  Interpolation: MAIN.WISS,
  // Logik und Argumentation (unter "Erkenntnis & Wissenschaft" gelistete Schlussbegriffe)
  Prämisse: MAIN.LOGIK, Deduktion: MAIN.LOGIK,
  // Recht und Ethik
  Deontologie: MAIN.RECHT, Utilitarismus: MAIN.RECHT, normativ: MAIN.RECHT,
  deskriptiv: MAIN.RECHT, Präzedenzfall: MAIN.RECHT, Devianz: MAIN.RECHT,
  Anomie: MAIN.RECHT, Autonomie: MAIN.RECHT, Instrumentalisierung: MAIN.RECHT,
  Kollektivismus: MAIN.RECHT, Individualismus: MAIN.RECHT,
  // Wirtschaft und Organisation
  Meritokratie: MAIN.WIRT, Bürokratisierung: MAIN.WIRT, Zentralisierung: MAIN.WIRT,
  Dezentralisierung: MAIN.WIRT, Subsidiarität: MAIN.WIRT, Korporatismus: MAIN.WIRT,
  Stratifikation: MAIN.WIRT, Proliferation: MAIN.WIRT, Akkumulation: MAIN.WIRT,
  Volatilität: MAIN.WIRT, Disruption: MAIN.WIRT, Adaption: MAIN.WIRT,
  Friktion: MAIN.WIRT, Diffusion: MAIN.WIRT,
  // Kultur und Geschichte
  Säkularisierung: MAIN.KULTUR, Utopie: MAIN.KULTUR, Dystopie: MAIN.KULTUR,
  Assimilation: MAIN.KULTUR, Akkulturation: MAIN.KULTUR, Anachronismus: MAIN.KULTUR,
  Orthodoxie: MAIN.KULTUR, Etymologie: MAIN.KULTUR, Mimesis: MAIN.KULTUR,
  Intertextualität: MAIN.KULTUR, Genese: MAIN.KULTUR, Emanzipation: MAIN.KULTUR,
  // Sprache und Rhetorik (aus "Logik & Argumentation" verschobene Rhetorik-Begriffe)
  Invektive: MAIN.SPRACHE, Eristik: MAIN.SPRACHE, Sophismus: MAIN.SPRACHE,
  // Psychologie behält Introspektion/Metakognition
  Introspektion: MAIN.PSYCH, Metakognition: MAIN.PSYCH,
};

// Angereicherte Wörter (zweite Erklärung + zweiter Beispielsatz) für den
// balancierten Aktivierungssatz. 11 Wörter je Hauptkategorie = 110.
const ENRICH = {
  // ---- Philosophie und Erkenntnistheorie ----
  Epistemologie: { def2: "Der Teilbereich der Philosophie, der fragt, was wir überhaupt wissen können und woran sich echtes Wissen erkennen lässt.", ex2: "In ihrer Vorlesung zur Epistemologie unterschied die Professorin sorgfältig zwischen bloßer Meinung und begründetem Wissen." },
  Ontologie: { def2: "Die Lehre davon, was es grundlegend gibt und in welche Grundarten sich alles Seiende einteilen lässt.", ex2: "Ob Zahlen wirklich existieren oder nur nützliche Erfindungen sind, ist eine klassische Frage der Ontologie." },
  Teleologie: { def2: "Eine Denkweise, die Dinge von ihrem Zweck oder Ziel her erklärt statt allein von ihren Ursachen.", ex2: "Wer sagt, das Herz sei dazu da, Blut zu pumpen, argumentiert teleologisch." },
  Determinismus: { def2: "Die Annahme, dass jedes Ereignis vollständig durch vorherige Ursachen festgelegt ist und nichts wirklich zufällig geschieht.", ex2: "Der strenge Determinismus stellt die Frage, ob unter diesen Bedingungen ein freier Wille überhaupt möglich ist." },
  Holismus: { def2: "Die Auffassung, dass ein Ganzes mehr ist als die Summe seiner Teile und nur im Zusammenhang verstanden werden kann.", ex2: "Aus Sicht des Holismus lässt sich ein Ökosystem nicht begreifen, wenn man nur einzelne Arten isoliert betrachtet." },
  Realismus: { def2: "Die philosophische Position, dass die Welt unabhängig von unserem Denken und Wahrnehmen existiert.", ex2: "Der wissenschaftliche Realismus geht davon aus, dass auch unsichtbare Teilchen wie Elektronen wirklich existieren." },
  Relativismus: { def2: "Die Ansicht, dass Wahrheit oder Werte nicht absolut gelten, sondern vom jeweiligen Standpunkt abhängen.", ex2: "Ein kultureller Relativismus warnt davor, fremde Bräuche vorschnell mit eigenen Maßstäben zu verurteilen." },
  Immanenz: { def2: "Das Innewohnen einer Sache in etwas anderem, ohne einen Bezug auf ein Jenseits oder Äußeres.", ex2: "Manche Denker suchen den Sinn in der Immanenz des Lebens selbst statt in einer höheren Ordnung." },
  Transzendenz: { def2: "Das Überschreiten der Grenzen der sinnlichen Erfahrung hin zu etwas, das darüber hinausliegt.", ex2: "Religiöse Erfahrungen zielen häufig auf eine Transzendenz, die sich der nüchternen Beschreibung entzieht." },
  Kontingenz: { def2: "Die Eigenschaft von etwas, das ebenso gut auch anders sein könnte und weder notwendig noch unmöglich ist.", ex2: "Dass gerade dieser Kandidat gewann, verdankt sich der Kontingenz vieler zufälliger Umstände." },
  Phänomenologie: { def2: "Eine philosophische Methode, die das bewusste Erleben genau so beschreibt, wie es sich unmittelbar zeigt.", ex2: "Die Phänomenologie fragt nicht, was Farbe physikalisch ist, sondern wie das Sehen von Rot erlebt wird." },

  // ---- Wissenschaft und Forschung ----
  Korrelation: { def2: "Ein statistischer Zusammenhang, bei dem zwei Größen gemeinsam schwanken, ohne dass die eine die andere verursachen muss.", ex2: "Der Verkauf von Speiseeis und die Zahl der Sonnenbrände zeigen eine Korrelation, weil beide vom Wetter abhängen." },
  Kausalität: { def2: "Das Verhältnis von Ursache und Wirkung, bei dem das eine das andere tatsächlich hervorbringt.", ex2: "Erst ein kontrolliertes Experiment konnte die Kausalität zwischen dem Wirkstoff und der Heilung belegen." },
  Varianz: { def2: "Ein Maß dafür, wie stark einzelne Messwerte um ihren Durchschnitt streuen.", ex2: "Bei geringer Varianz liegen fast alle Ergebnisse dicht beim Mittelwert." },
  Reliabilität: { def2: "Die Zuverlässigkeit einer Messung, also ob sie bei Wiederholung stabile Werte liefert.", ex2: "Eine Waage mit hoher Reliabilität zeigt für dasselbe Gewicht stets nahezu denselben Wert an." },
  Replikation: { def2: "Die erneute Durchführung einer Studie, um zu prüfen, ob sich ihr Ergebnis bestätigt.", ex2: "Erst nach mehrfacher Replikation gilt ein psychologischer Effekt als gut gesichert." },
  Operationalisierung: { def2: "Das Übersetzen eines abstrakten Begriffs in konkret messbare Größen.", ex2: "Für die Studie wurde „Stress“ durch Operationalisierung als Puls und Cortisolspiegel messbar gemacht." },
  Methodologie: { def2: "Die begründete Lehre von den Vorgehensweisen, mit denen eine Wissenschaft zu ihren Ergebnissen kommt.", ex2: "Ein sauberes Kapitel zur Methodologie erklärt, warum gerade diese Erhebungsmethode gewählt wurde." },
  Evidenz: { def2: "Die Gesamtheit der Belege, die für oder gegen eine Behauptung sprechen.", ex2: "Für diese Therapie gibt es bislang nur schwache Evidenz aus kleinen Fallzahlen." },
  Falsifikation: { def2: "Der Nachweis, dass eine Annahme falsch ist, weil eine Beobachtung ihr klar widerspricht.", ex2: "Ein einziger schwarzer Schwan genügt zur Falsifikation des Satzes, alle Schwäne seien weiß." },
  Konstrukt: { def2: "Ein gedanklich gebildetes Merkmal, das man nicht direkt sehen, sondern nur über Anzeichen erschließen kann.", ex2: "„Intelligenz“ ist ein Konstrukt, das erst durch Tests fassbar gemacht wird." },
  Verifikation: { def2: "Die Bestätigung einer Annahme durch Beobachtungen, die zu ihr passen.", ex2: "Die Vorhersage der Planetenbahn diente als Verifikation der neuen Theorie." },

  // ---- Logik und Argumentation ----
  Prämisse: { def2: "Eine vorausgesetzte Aussage, aus der in einem Argument eine Schlussfolgerung gezogen wird.", ex2: "Wenn schon die erste Prämisse zweifelhaft ist, trägt auch der beste Schluss nicht." },
  Syllogismus: { def2: "Ein klassisches Schlussverfahren, das aus zwei Voraussetzungen zwingend eine dritte Aussage ableitet.", ex2: "„Alle Menschen sind sterblich; Sokrates ist ein Mensch; also ist Sokrates sterblich“ ist der berühmteste Syllogismus." },
  Deduktion: { def2: "Ein Schluss, bei dem aus allgemeinen Regeln mit Sicherheit ein Einzelfall folgt.", ex2: "Aus dem Gesetz leitete der Richter per Deduktion die Entscheidung für diesen konkreten Fall ab." },
  Inferenz: { def2: "Der gedankliche Schritt, mit dem man aus Gegebenem etwas Neues folgert.", ex2: "Aus den Spuren im Schnee zog der Fährtenleser die Inferenz, dass das Tier erst kürzlich vorbeigekommen war." },
  Tautologie: { def2: "Eine Aussage, die schon durch ihre Form immer wahr ist und deshalb nichts Neues mitteilt.", ex2: "„Morgen regnet es, oder es regnet nicht“ ist eine Tautologie ohne jeden Informationswert." },
  Zirkelschluss: { def2: "Ein Fehler, bei dem das, was bewiesen werden soll, bereits in der Begründung vorausgesetzt wird.", ex2: "Wer die Bibel für wahr hält, weil sie das über sich selbst behauptet, begeht einen Zirkelschluss." },
  Analogie: { def2: "Eine Übertragung, die von der Ähnlichkeit zweier Fälle auf weitere Gemeinsamkeiten schließt.", ex2: "Mit der Analogie zum Wasserkreislauf erklärte der Lehrer den Stromfluss im Kabel." },
  Dilemma: { def2: "Eine Zwangslage, in der man zwischen zwei Möglichkeiten wählen muss, die beide unerwünscht sind.", ex2: "Sie steckte im Dilemma, entweder die Freundin zu verraten oder selbst die Schuld zu tragen." },
  Antinomie: { def2: "Ein Widerspruch zwischen zwei Aussagen, die sich beide gleich gut begründen lassen.", ex2: "Kant beschrieb die Antinomie, dass die Welt sowohl einen Anfang zu haben als auch keinen haben zu können scheint." },
  Dialektik: { def2: "Eine Denkbewegung, die aus dem Gegeneinander von These und Gegenthese eine höhere Einsicht gewinnt.", ex2: "In der Dialektik des Gesprächs schärften sich die Positionen erst durch den Widerspruch." },
  Kontradiktion: { def2: "Der harte Fall des Widerspruchs, bei dem eine Aussage und ihr genaues Gegenteil zugleich behauptet werden.", ex2: "Zu sagen, der Kreis sei rund und zugleich eckig, ist eine reine Kontradiktion." },

  // ---- Psychologie und Verhalten ----
  Affekt: { def2: "Eine kurze, heftige Gefühlsregung, die das Verhalten unmittelbar antreibt.", ex2: "Im Affekt sagte er Dinge, die er später zutiefst bereute." },
  Aversion: { def2: "Eine starke, oft körperlich spürbare Abneigung gegen etwas oder jemanden.", ex2: "Nach der Lebensmittelvergiftung entwickelte sie eine hartnäckige Aversion gegen Muscheln." },
  Dissonanz: { def2: "Das unangenehme Spannungsgefühl, wenn Überzeugungen und eigenes Verhalten nicht zusammenpassen.", ex2: "Wer raucht und zugleich auf Gesundheit achtet, erlebt eine kognitive Dissonanz." },
  Resilienz: { def2: "Die seelische Widerstandskraft, sich von Belastungen zu erholen und daran nicht zu zerbrechen.", ex2: "Ihre Resilienz half ihr, nach dem Rückschlag rasch wieder Fuß zu fassen." },
  Ressentiment: { def2: "Ein lang gehegter, verdeckter Groll, der sich aus gekränktem Stolz oder Neid speist.", ex2: "Aus dem alten Ressentiment gegen die Nachbarn wurde über die Jahre offene Feindseligkeit." },
  Projektion: { def2: "Das unbewusste Zuschreiben eigener Gefühle oder Fehler an andere Menschen.", ex2: "Seine ständigen Betrugsvorwürfe waren womöglich eine Projektion des eigenen schlechten Gewissens." },
  Konformität: { def2: "Die Anpassung des eigenen Verhaltens an die Erwartungen einer Gruppe.", ex2: "Aus Konformität hob auch sie die Hand, obwohl sie anderer Meinung war." },
  Sozialisation: { def2: "Der lebenslange Prozess, in dem ein Mensch die Regeln und Werte seiner Umgebung übernimmt.", ex2: "Durch die Sozialisation im Elternhaus lernte er früh, Konflikte im Gespräch zu lösen." },
  Kompensation: { def2: "Der Ausgleich einer empfundenen Schwäche durch besondere Anstrengung an anderer Stelle.", ex2: "Als Kompensation für seine Schüchternheit stürzte er sich mit Eifer in die Arbeit." },
  Selbstwirksamkeit: { def2: "Die Überzeugung, schwierige Aufgaben aus eigener Kraft bewältigen zu können.", ex2: "Jeder gemeisterte Auftritt stärkte ihre Selbstwirksamkeit ein Stück weiter." },
  Impulsivität: { def2: "Die Neigung, spontan zu handeln, ohne die Folgen vorher abzuwägen.", ex2: "Seine Impulsivität brachte ihn immer wieder zu übereilten Käufen." },

  // ---- Sprache und Rhetorik ----
  Metapher: { def2: "Ein sprachliches Bild, das einen Begriff durch einen anderen ersetzt, um eine Ähnlichkeit auszudrücken.", ex2: "Mit der Metapher vom „Herbst des Lebens“ meinte sie das nahende Alter." },
  Metonymie: { def2: "Eine Ersetzung, bei der man eine Sache durch etwas eng damit Verbundenes benennt.", ex2: "Wenn man sagt „das Weiße Haus erklärte“, steht die Metonymie für die US-Regierung." },
  Euphemismus: { def2: "Eine beschönigende Umschreibung, die etwas Unangenehmes milder klingen lässt.", ex2: "„Freisetzung von Mitarbeitern“ ist ein Euphemismus für Entlassungen." },
  Hyperbel: { def2: "Eine bewusste Übertreibung, die eine Aussage verstärken soll.", ex2: "„Ich habe dir das schon tausendmal gesagt“ ist eine typische Hyperbel." },
  Aphorismus: { def2: "Ein kurzer, zugespitzter Gedanke, der eine Einsicht pointiert auf den Punkt bringt.", ex2: "„Wer nichts weiß, muss alles glauben“ ist ein bekannter Aphorismus." },
  Allegorie: { def2: "Eine durchgehende Bildrede, in der ein abstrakter Gedanke als Figur oder Geschichte dargestellt wird.", ex2: "Die Justitia mit Waage und verbundenen Augen ist eine Allegorie der Gerechtigkeit." },
  Antithese: { def2: "Die wirkungsvolle Gegenüberstellung zweier gegensätzlicher Gedanken.", ex2: "„Der eine schuftet, der andere prasst“ setzt die Ungleichheit als Antithese in Szene." },
  Paradoxon: { def2: "Eine scheinbar widersinnige Aussage, die bei näherem Hinsehen doch einen wahren Kern enthält.", ex2: "„Ich weiß, dass ich nichts weiß“ ist das berühmte Paradoxon des Sokrates." },
  Neologismus: { def2: "Ein neu gebildetes Wort, das in den Sprachgebrauch eintritt.", ex2: "„Klimakleber“ war vor wenigen Jahren noch ein Neologismus." },
  Semantik: { def2: "Der Bereich der Sprachwissenschaft, der sich mit der Bedeutung von Wörtern und Sätzen befasst.", ex2: "Ein Streit um Semantik entzündete sich daran, was genau „fair“ bedeuten soll." },
  Pathos: { def2: "Der Gefühlsappell einer Rede, der das Publikum ergreifen und mitreißen soll.", ex2: "Mit spürbarem Pathos beschwor der Redner den Zusammenhalt der Gemeinschaft." },

  // ---- Politik und Gesellschaft ----
  Ideologie: { def2: "Ein geschlossenes System von Ideen, das Gesellschaft deutet und politisches Handeln begründet.", ex2: "Hinter dem Programm stand eine klare Ideologie von Markt und Eigenverantwortung." },
  Pluralismus: { def2: "Die Anerkennung und geordnete Koexistenz vieler unterschiedlicher Meinungen und Gruppen.", ex2: "Ein lebendiger Pluralismus erträgt es, dass konkurrierende Weltbilder nebeneinander bestehen." },
  Populismus: { def2: "Ein politischer Stil, der ein „reines Volk“ gegen „die Eliten“ ausspielt und einfache Lösungen verspricht.", ex2: "Der Populismus der Rede bestand darin, komplexe Probleme auf einen einzigen Schuldigen zu verengen." },
  Totalitarismus: { def2: "Eine Herrschaftsform, die das gesamte Leben der Menschen durchdringen und kontrollieren will.", ex2: "Im Totalitarismus gibt es keinen Bereich, der dem Zugriff des Staates entzogen bliebe." },
  Partizipation: { def2: "Die aktive Teilhabe der Bürger an Entscheidungen, die sie betreffen.", ex2: "Ein Bürgerhaushalt soll die Partizipation an der kommunalen Finanzplanung stärken." },
  Polarisierung: { def2: "Das Auseinanderdriften einer Gesellschaft in verhärtete, gegnerische Lager.", ex2: "Die Debatte trieb die Polarisierung so weit, dass ein Gespräch kaum noch möglich war." },
  Souveränität: { def2: "Die oberste Entscheidungsgewalt eines Staates über sein eigenes Gebiet nach innen und außen.", ex2: "Der Vertrag berührte die Frage, wie viel Souveränität ein Land an ein Bündnis abgibt." },
  Legitimität: { def2: "Die Anerkennung von Herrschaft als rechtmäßig und deshalb zu Recht gehorchenswert.", ex2: "Ohne freie Wahlen fehlte der Regierung in den Augen vieler die Legitimität." },
  Repräsentation: { def2: "Die Vertretung der Interessen vieler durch gewählte Stellvertreter.", ex2: "Man kritisierte, dass die Repräsentation der Jüngeren im Parlament zu schwach sei." },
  Hegemonie: { def2: "Die überlegene Vormacht eines Akteurs, die weniger auf Zwang als auf Führung und Zustimmung beruht.", ex2: "Nach dem Krieg festigte die Großmacht ihre wirtschaftliche Hegemonie über die Region." },
  Emanzipation: { def2: "Die Befreiung aus Abhängigkeit und Bevormundung hin zu Selbstbestimmung.", ex2: "Die Emanzipation der Arbeiterschaft begann mit dem Recht, sich zu organisieren." },

  // ---- Wirtschaft und Organisation ----
  Meritokratie: { def2: "Eine Ordnung, in der Position und Aufstieg an Leistung und Können geknüpft sein sollen.", ex2: "Kritiker der Meritokratie fragen, ob Startchancen wirklich für alle gleich sind." },
  Bürokratisierung: { def2: "Die zunehmende Durchdringung von Abläufen mit festen Regeln, Zuständigkeiten und Formularen.", ex2: "Die wachsende Bürokratisierung machte selbst kleine Anschaffungen zu einem langwierigen Verfahren." },
  Zentralisierung: { def2: "Das Bündeln von Entscheidungen und Befugnissen an einer obersten Stelle.", ex2: "Die Zentralisierung des Einkaufs sollte im Konzern Kosten senken." },
  Dezentralisierung: { def2: "Das Verteilen von Entscheidungen auf viele eigenständige Einheiten.", ex2: "Durch Dezentralisierung erhielten die Filialen mehr Freiheit bei der Preisgestaltung." },
  Subsidiarität: { def2: "Der Grundsatz, dass die jeweils kleinere Einheit entscheidet, solange sie es selbst kann.", ex2: "Nach dem Prinzip der Subsidiarität regelt die Gemeinde, was sie ohne den Bund bewältigt." },
  Akkumulation: { def2: "Das allmähliche Anhäufen von Kapital, Gütern oder Ressourcen.", ex2: "Die Akkumulation von Rücklagen erlaubte dem Betrieb später eine große Investition." },
  Volatilität: { def2: "Das Ausmaß, in dem Preise oder Werte in kurzer Zeit stark schwanken.", ex2: "Die hohe Volatilität der Aktie schreckte vorsichtige Anleger ab." },
  Disruption: { def2: "Ein Umbruch, bei dem eine Neuerung bestehende Märkte oder Abläufe grundlegend verdrängt.", ex2: "Das Smartphone löste eine Disruption der gesamten Fotobranche aus." },
  Stratifikation: { def2: "Die Schichtung einer Gesellschaft in über- und untergeordnete Ränge.", ex2: "Die soziale Stratifikation zeigte sich schon daran, welche Schule ein Kind besuchte." },
  Proliferation: { def2: "Die rasche, oft unkontrollierte Ausbreitung oder Vermehrung von etwas.", ex2: "Die Proliferation von Zwischenhändlern trieb den Endpreis in die Höhe." },
  Adaption: { def2: "Die Anpassung an veränderte Bedingungen, um leistungs- oder überlebensfähig zu bleiben.", ex2: "Die schnelle Adaption an das Online-Geschäft rettete den kleinen Verlag." },

  // ---- Kultur und Geschichte ----
  Säkularisierung: { def2: "Das Zurückdrängen religiöser Deutung und Institutionen aus dem öffentlichen Leben.", ex2: "Mit der Säkularisierung verlor die Kirche ihren Einfluss auf Schule und Recht." },
  Utopie: { def2: "Der Entwurf einer idealen Gesellschaft, die so noch nirgends verwirklicht ist.", ex2: "Sein Roman zeichnete die Utopie einer Welt ohne Geld und Besitz." },
  Dystopie: { def2: "Das Gegenbild zur Utopie: eine erschreckende Zukunftsgesellschaft als Warnung.", ex2: "In der Dystopie überwachte ein allgegenwärtiger Staat jeden Gedanken der Bürger." },
  Assimilation: { def2: "Die weitgehende Angleichung einer Gruppe an die Kultur der Mehrheit bis zur Aufgabe eigener Merkmale.", ex2: "Die dritte Generation war durch Assimilation kaum noch von der Umgebung zu unterscheiden." },
  Akkulturation: { def2: "Der wechselseitige Kulturwandel, wenn zwei Gruppen über längere Zeit in Kontakt stehen.", ex2: "Die Akkulturation zeigte sich in einer Küche, die Zutaten beider Herkünfte verband." },
  Anachronismus: { def2: "Etwas, das nicht in seine Zeit passt, weil es einer anderen Epoche angehört.", ex2: "Die Armbanduhr am Arm des Römers war ein peinlicher Anachronismus im Film." },
  Orthodoxie: { def2: "Das strenge Festhalten an der überlieferten, für rein gehaltenen Lehre.", ex2: "Jede Abweichung von der Orthodoxie galt der Bewegung als Verrat." },
  Etymologie: { def2: "Die Erforschung der Herkunft und Bedeutungsgeschichte von Wörtern.", ex2: "Die Etymologie führt „Fenster“ auf das lateinische „fenestra“ zurück." },
  Mimesis: { def2: "Die künstlerische Nachahmung der Wirklichkeit als Grundprinzip der Darstellung.", ex2: "Die antike Theorie sah in der Mimesis den Kern jeder Malerei und Dichtung." },
  Intertextualität: { def2: "Das Verweisen eines Textes auf andere Texte durch Zitate, Anspielungen oder Motive.", ex2: "Der Roman lebt von einer Intertextualität, die ständig auf alte Mythen anspielt." },
  Genese: { def2: "Die Entstehung und schrittweise Entwicklung einer Sache von ihrem Ursprung an.", ex2: "Das Buch schildert die Genese der Demokratie von der antiken Polis bis heute." },

  // ---- Recht und Ethik ----
  Deontologie: { def2: "Eine Ethik, die Handlungen nach Pflichten und Regeln beurteilt, nicht nach ihren Folgen.", ex2: "Aus Sicht der Deontologie bleibt Lügen auch dann verboten, wenn es Vorteile brächte." },
  Utilitarismus: { def2: "Eine Ethik, die jene Handlung für richtig hält, die das größte Wohl für die meisten schafft.", ex2: "Der Utilitarismus rechtfertigt eine Maßnahme, wenn ihr Nutzen den Schaden insgesamt überwiegt." },
  normativ: { def2: "Bezogen auf das, was gelten oder sein soll, statt auf das bloß Vorhandene.", ex2: "„Alle sollen gleich behandelt werden“ ist eine normative Forderung, keine Tatsachenaussage." },
  deskriptiv: { def2: "Bloß beschreibend, wie etwas tatsächlich ist, ohne es zu bewerten.", ex2: "Der Bericht blieb streng deskriptiv und enthielt sich jeder Empfehlung." },
  Präzedenzfall: { def2: "Ein früherer Fall, dessen Entscheidung als Maßstab für spätere gleichartige Fälle dient.", ex2: "Das Urteil schuf einen Präzedenzfall, auf den sich künftige Kläger berufen konnten." },
  Devianz: { def2: "Verhalten, das von den geltenden Normen einer Gruppe deutlich abweicht.", ex2: "Was in der einen Gemeinschaft als Devianz gilt, ist in einer anderen völlig normal." },
  Anomie: { def2: "Ein Zustand, in dem verbindliche Normen fehlen oder ihre Kraft verlieren.", ex2: "Nach dem Zusammenbruch der alten Ordnung breitete sich eine gefährliche Anomie aus." },
  Autonomie: { def2: "Die Fähigkeit und das Recht, sich nach selbst gegebenen Regeln zu bestimmen.", ex2: "Die ärztliche Ethik achtet die Autonomie des Patienten bei jeder Behandlungsentscheidung." },
  Instrumentalisierung: { def2: "Das Ausnutzen einer Person oder Sache als bloßes Mittel für fremde Zwecke.", ex2: "Man warf der Kampagne die Instrumentalisierung des Leids der Opfer vor." },
  Kollektivismus: { def2: "Eine Haltung, die dem Wohl der Gemeinschaft Vorrang vor den Interessen des Einzelnen gibt.", ex2: "Im Kollektivismus zählt weniger der persönliche Erfolg als der Nutzen für die Gruppe." },
  Individualismus: { def2: "Eine Haltung, die die Freiheit und den Eigenwert des einzelnen Menschen in den Mittelpunkt stellt.", ex2: "Der westliche Individualismus betont das Recht, den eigenen Lebensweg selbst zu wählen." },

  // ---- Allgemeine Bildungssprache ----
  adäquat: { def2: "Einer Sache genau angemessen, ohne zu viel oder zu wenig zu sein.", ex2: "Für den Anlass wählte sie eine adäquate, zurückhaltende Kleidung." },
  arbiträr: { def2: "Ohne sachlichen Grund festgelegt, allein auf Willkür oder Übereinkunft beruhend.", ex2: "Dass Rot „Stopp“ bedeutet, ist arbiträr und hätte auch anders vereinbart werden können." },
  immanent: { def2: "Einer Sache innewohnend, aus ihr selbst hervorgehend statt von außen hinzukommend.", ex2: "Dem Projekt war von Beginn an ein immanenter Zielkonflikt eingeschrieben." },
  sukzessiv: { def2: "Schritt für Schritt aufeinanderfolgend, nicht auf einmal.", ex2: "Die Reformen wurden sukzessiv über mehrere Jahre eingeführt." },
  simultan: { def2: "Zur gleichen Zeit ablaufend, gleichzeitig.", ex2: "Die Dolmetscherin übertrug die Rede nahezu simultan ins Deutsche." },
  prospektiv: { def2: "Nach vorn, in die Zukunft gerichtet.", ex2: "Die Studie war prospektiv angelegt und begleitete die Teilnehmer über zehn Jahre." },
  retrospektiv: { def2: "Zurückblickend, aus der Sicht auf bereits Vergangenes.", ex2: "Retrospektiv erschienen die damaligen Sorgen weit übertrieben." },
  konstitutiv: { def2: "Für etwas grundlegend bestimmend, so dass es ohne dieses Merkmal gar nicht bestünde.", ex2: "Das Vertrauen der Bürger ist konstitutiv für jede Demokratie." },
  Manifestation: { def2: "Das sichtbare Zutagetreten von etwas zuvor Verborgenem.", ex2: "Der Streik war die Manifestation einer lange schwelenden Unzufriedenheit." },
  Transformation: { def2: "Eine tiefgreifende Umgestaltung, die den Charakter einer Sache verändert.", ex2: "Die digitale Transformation krempelte die Arbeitsweise der Behörde von Grund auf um." },
  Komplexität: { def2: "Der Grad, in dem viele Teile so verflochten sind, dass sich das Ganze schwer überblicken lässt.", ex2: "Die Komplexität des Steuerrechts überfordert selbst manche Fachleute." },
};

function mainCategory(word, srcCat) {
  if (CAT_OVERRIDE[word]) return CAT_OVERRIDE[word];
  return SRC_DEFAULT[srcCat] || MAIN.BILDUNG;
}

function sqlStr(v) {
  if (v === null || v === undefined) return "null";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function main() {
  const srcPath = process.argv[2];
  if (!srcPath) {
    console.error("Bitte Pfad zur Quell-JSON angeben.");
    process.exit(1);
  }
  const src = JSON.parse(fs.readFileSync(srcPath, "utf8"));

  const catalog = src.map((d) => {
    const cat = mainCategory(d.wort, d.kategorie);
    const enr = ENRICH[d.wort] || null;
    return {
      position: d.reihenfolge,
      word: d.wort,
      part_of_speech: d.wortart || null,
      category: cat,
      definition: d.erklaerung || "",
      definition2: enr ? enr.def2 : null,
      example: d.beispielsatz || null,
      example2: enr ? enr.ex2 : null,
      enriched: !!enr,
    };
  });

  // Balancierte Aktivierungsreihenfolge: Round-Robin über die Hauptkategorien,
  // nur für angereicherte Wörter. So ist ein früh abgebrochener Import trotzdem
  // ausgewogen über die zehn Kategorien verteilt.
  const mainOrder = Object.values(MAIN);
  const byCat = {};
  mainOrder.forEach((c) => (byCat[c] = []));
  catalog
    .filter((w) => w.enriched)
    .sort((a, b) => a.position - b.position)
    .forEach((w) => byCat[w.category].push(w));
  const activation = {};
  let order = 1;
  let added = true;
  for (let i = 0; added; i++) {
    added = false;
    for (const c of mainOrder) {
      if (byCat[c][i]) {
        activation[byCat[c][i].word] = order++;
        added = true;
      }
    }
  }
  catalog.forEach((w) => (w.activation_order = activation[w.word] || null));

  // Kanonischen Datensatz schreiben
  fs.writeFileSync(
    path.join(__dirname, "words_catalog.json"),
    JSON.stringify(catalog, null, 2),
    "utf8"
  );

  // SQL-Seed erzeugen (idempotent via ON CONFLICT (word))
  const lines = [];
  lines.push("-- AUTOGENERIERT von build_catalog.mjs – nicht von Hand bearbeiten.");
  lines.push("-- Seed der Warteliste public.word_queue mit allen 250 Vokabeln.");
  lines.push("-- Idempotent: erneutes Ausführen aktualisiert nur den Katalogtext,");
  lines.push("-- ändert aber keinen bereits gesetzten Verarbeitungsstatus.");
  lines.push("");
  lines.push("insert into public.word_queue");
  lines.push("  (position, word, part_of_speech, category, definition, definition2, example, example2, enriched, activation_order)");
  lines.push("values");
  const values = catalog.map((w) => {
    return (
      "  (" +
      [
        w.position,
        sqlStr(w.word),
        sqlStr(w.part_of_speech),
        sqlStr(w.category),
        sqlStr(w.definition),
        sqlStr(w.definition2),
        sqlStr(w.example),
        sqlStr(w.example2),
        w.enriched ? "true" : "false",
        w.activation_order === null ? "null" : w.activation_order,
      ].join(", ") +
      ")"
    );
  });
  lines.push(values.join(",\n") + "");
  lines.push("on conflict (word) do update set");
  lines.push("  position = excluded.position,");
  lines.push("  part_of_speech = excluded.part_of_speech,");
  lines.push("  category = excluded.category,");
  lines.push("  definition = excluded.definition,");
  lines.push("  definition2 = excluded.definition2,");
  lines.push("  example = excluded.example,");
  lines.push("  example2 = excluded.example2,");
  lines.push("  enriched = excluded.enriched,");
  lines.push("  activation_order = excluded.activation_order;");
  lines.push("");
  fs.writeFileSync(path.join(__dirname, "003_seed_word_queue.sql"), lines.join("\n"), "utf8");

  // Kurzstatistik ausgeben
  const catCount = {};
  const enrCatCount = {};
  catalog.forEach((w) => {
    catCount[w.category] = (catCount[w.category] || 0) + 1;
    if (w.enriched) enrCatCount[w.category] = (enrCatCount[w.category] || 0) + 1;
  });
  console.log("Katalog gesamt:", catalog.length);
  console.log("Angereichert (aktivierbar):", catalog.filter((w) => w.enriched).length);
  console.log("\nVerteilung (gesamt / angereichert) je Hauptkategorie:");
  mainOrder.forEach((c) => {
    console.log(`  ${(catCount[c] || 0).toString().padStart(3)} / ${(enrCatCount[c] || 0).toString().padStart(2)}  ${c}`);
  });
}

main();
