"""Piani alimentari dimostrativi, trascritti da Franco.pdf e Giorgia.pdf."""
from .services.diet import DietIn

NOTES = [
    "I cibi vanno pesati crudi e al netto degli scarti",
    "È possibile utilizzare aceto, succo di limone, erbe aromatiche e spezie in quantità libera",
    "Moderare l'utilizzo di sale",
    "Ci si pesa solo una volta alla settimana, sempre di mattina a digiuno, svestiti",
]


def M(name, qty=None, unit="g", text="", note="", mx=None):
    return {"name": name, "qty": qty, "unit": unit, "qty_text": text, "note": note, "max_per_week": mx}


def G(gid, name, qty, unit, members, note=""):
    return {"id": gid, "name": name, "ref_qty": qty, "ref_unit": unit, "note": note, "members": members}


def I(name, qty=None, unit="g", group=None, text="", note="", mx=None):
    return {"name": name, "qty": qty, "unit": unit, "qty_text": text, "group_id": group, "note": note,
            "max_per_week": mx}


def O(label, items, course="", kind="choice", mx=None, note=""):
    return {"label": label, "course": course, "kind": kind, "max_per_week": mx, "note": note, "items": items}


def MEAL(mid, name, time, options, same_as=None, kind="meal", required=True, note=""):
    return {"id": mid, "name": name, "time": time, "kind": kind, "required": required,
            "same_as_meal_id": same_as, "note": note, "options": options}


def franco() -> DietIn:
    groups = [
        G("g_carne", "Carne", 200, "g", [
            M("Vitello, Tacchino, Cavallo, Maiale lonza, Bovino", 200),
            M("Prosciutto cotto o crudo, speck magri o bresaola", 90),
            M("Arrosto", 160),
            M("Uova + grana", None, "g", "2 + 10 g di grana"),
            M("Formaggi freschi", 90),
            M("Formaggi stagionati (tipo grana o Emmenthal)", 50),
            M("Ricotta", 120),
            M("Pesce di lago o di mare", 220),
            M("Tonno o salmone freschi", 110),
            M("Tonno sott'olio", 100, note="1 scatoletta piccola = 60 gr"),
            M("Sgombro ai ferri", 100),
            M("Lenticchie in scatola", 220),
            M("Ceci in scatola", 160),
            M("Fagioli o piselli in scatola", 240),
        ]),
        G("g_pane70", "Pane", 70, "g", [
            M("Pasta o riso", 60), M("Pane all'olio", 60), M("Patate bollite", 250), M("Patate arrosto", 130),
            M("Crackers o grissini", 35), M("Gnocchi", 150), M("Polenta", 110), M("Taralli", 35),
            M("Pasta sfoglia", 60),
        ]),
        G("g_latte", "Latte parzialmente scremato", 150, "ml", [
            M("Yogurt alla frutta", 125), M("Succo di frutta al naturale senza zuccheri aggiunti", 200, "ml"),
            M("Tè o tisana"), M("Frutta fresca", 150),
        ]),
        G("g_biscotti", "Biscotti frollini", 75, "g", [
            M("Fette biscottate", 75), M("Biscotti secchi", 75), M("Cereali", 75), M("Biscotti Wafers", 55),
            M("Crackers", 75), M("Brioche", 1, "pz"), M("Pane + marmellata", None, "g", "70 g + 40 g"),
        ]),
        G("g_frutta", "Frutta", 150, "g", [
            M("Frutta fresca a piacere", 150), M("Anguria", 300),
            M("Fichi freschi, uva, banane, mele, mandarini", 90), M("Avocado", 10),
            M("Frutta secca (mandorle, noci, nocciole, arachidi, pinoli, pistacchi)", 10), M("Cocco", 15),
            M("Castagne, datteri, fichi secchi", 45, mx=1),
        ], "È possibile variare il tipo di frutta a piacere pur rimanendo nelle dosi indicate (150 g), tranne che per:"),
        G("g_dolce", "Dolce", None, "porzione", [
            M("Sorbetto", 150), M("Yogurt", 125), M("Succo di frutta", 200, "ml"), M("Frutta a piacere", 300),
            M("Torta", 40), M("Crem caramel", 120), M("Gelato piccolo", 100), M("Ghiacciolo", 2, "pz"),
            M("Cioccolato", 30), M("Nutella", None, "g", "2 cucchiaini"), M("Patatine fritte", 30),
            M("Birra media", 1, "pz"), M("Vino", 150, "ml"), M("Latte HD", 450, "ml", "(150 x 3)"),
        ]),
        G("g_pasta", "Pasta, riso, orzo, farro, cous cous, quinoa", 120, "g", [
            M("Pane tipo 0", 160), M("Gnocchi", 300), M("Polenta", 240), M("Casoncelli", 180),
            M("Pasta e legumi in scatola", None, "g", "90 g + 70 g"), M("Pasta + pane", None, "g", "90 g + 40 g"),
        ]),
        G("g_sugo", "Sugo vegetale", 100, "g", [
            M("Sugo di verdure o funghi"),
            M("Sughi elaborati di carne o pesce", 90, mx=1, note="una volta alla settimana"),
            M("Pesto alla genovese", None, "g", "1 cucchiaino", mx=1, note="max 1 volta alla settimana"),
        ]),
        G("g_pane50", "Pane", 50, "g", [
            M("Pasta o riso", 40), M("Pane all'olio", 40), M("Patate bollite", 200), M("Patate arrosto", 100),
            M("Crackers, grissini, taralli", 30), M("Gnocchi", 140), M("Polenta", 80), M("Casoncelli", 60),
        ]),
    ]
    meals = [
        MEAL("m_colaz", "Colazione", "08:00", [O("A", [
            I("Latte HD", 150, "ml", "g_latte"), I("Biscotti", 75, "g", "g_biscotti")])]),
        MEAL("m_mm", "Metà mattina", "10:30", [
            O("A", [I("Biscotti", 25)]), O("B", [I("Gallette di riso o mais", 2, "pz")])]),
        MEAL("m_pranzo", "Pranzo", "13:00", [
            O("A", [I("Pasta", 120, "g", "g_pasta"), I("Sugo vegetale", 100, "g", "g_sugo"),
                    I("Formaggio grattugiato", 10), I("Pane", 50, "g", "g_pane50"),
                    I("Verdura a piacere", 100)], course="I"),
            O("B", [I("Lasagne", 350)], course="I"),
            O("C", [I("Pizza margherita o alle verdure oppure piadina")], course="I", mx=1,
              note="1 volta alla settimana"),
            O("D", [I("Carne", 200, "g", "g_carne"), I("Verdura a piacere", 200),
                    I("Pane", 70, "g", "g_pane70")], course="II"),
            O("E", [I("Vellutata di verdure", 1, "piatto"), I("Formaggio grattugiato", 10),
                    I("Carne", 200, "g", "g_carne"), I("Verdura a piacere", 200),
                    I("Pane", 70, "g", "g_pane70")], course="II"),
            O("F", [I("Prosciutto crudo", 90), I("Melone", 300), I("Pane", 50)], course="II"),
        ]),
        MEAL("m_mp", "Metà pomeriggio", "16:30", [O("A", [I("Frutta fresca", 150, "g", "g_frutta")])]),
        MEAL("m_cena", "Cena", "20:00", [], same_as="m_pranzo", note="Come a pranzo alternando le pietanze"),
        MEAL("m_extra", "Durante la giornata è possibile utilizzare", "", [O("", [
            I("Olio o burro", 40, "g", note="in totale nella giornata"),
            I("Dolce", None, "g", text="1 porzione", group="g_dolce", mx=2, note="max 2 volte alla settimana"),
        ])], kind="extras", required=False),
    ]
    return DietIn.model_validate({
        "name": "Piano alimentare - Parodi Franco", "description": "Piano dimostrativo (da Franco.pdf)",
        "notes": "\n".join(NOTES),
        "conversion": [{"name": n, "raw": r} for n, r in [
            ("Pasta", "120 g"), ("Orzo", "120 g"), ("Farro", "120 g"), ("Cous cous", "120 g"),
            ("Riso", "120 g"), ("Gnocchi", "300 g"), ("Casoncelli", "180 g")]],
        "groups": groups, "meals": meals})


def giorgia() -> DietIn:
    groups = [
        G("g_carne", "Carne", 200, "g", [
            M("Vitello, Tacchino, Cavallo, Maiale lonza, Bovino", 200),
            M("Prosciutto cotto o crudo, speck magri o bresaola", 90),
            M("Arrosto", 160),
            M("Uova + grana", None, "g", "2 + 10 g di grana"),
            M("Formaggi freschi", 90),
            M("Formaggi stagionati (tipo grana o Emmenthal)", 50),
            M("Ricotta", 120),
            M("Pesce di lago o di mare", 220),
            M("Tonno o salmone freschi", 110),
            M("Tonno sott'olio", 100),
            M("Sgombro ai ferri", 100),
            M("Lenticchie in scatola", 220),
            M("Ceci in scatola", 160),
            M("Fagioli o piselli in scatola", 240),
        ]),
        G("g_pane70", "Pane", 70, "g", [
            M("Pasta o riso", 60), M("Pane all'olio", 60), M("Patate bollite", 250), M("Patate arrosto", 130),
            M("Crackers", 35), M("Grissini", 35), M("Gnocchi", 110), M("Polenta", 110),
        ]),
        G("g_pasta", "Pasta, riso, orzo, farro, cous cous, quinoa", 100, "g", [
            M("Pane tipo 0", 130), M("Gnocchi", 250), M("Polenta", 200), M("Casoncelli", 150),
            M("Pasta e legumi in scatola", None, "g", "70 g + 70 g"), M("Pasta + pane", None, "g", "70 g + 40 g"),
        ]),
        G("g_sugo", "Sugo vegetale", 100, "g", [
            M("Sugo di verdure o al pomodoro (no avocado)"),
            M("Sughi elaborati di carne o pesce", 90, mx=1, note="una volta alla settimana"),
            M("Pesto alla genovese", 15, mx=1, note="1 volta alla settimana"),
        ]),
        G("g_frutta", "Frutta", 200, "g", [
            M("Frutta fresca a piacere", 200), M("Anguria", 400),
            M("Fichi freschi, uva, banane, mele, mandarini", 120), M("Avocado", 15),
            M("Frutta secca (mandorle, noci, nocciole, arachidi, pinoli, pistacchi)", 15), M("Cocco", 20),
            M("Castagne, datteri, fichi secchi", 50, mx=1),
        ], "È possibile variare il tipo di frutta a piacere pur rimanendo nelle dosi indicate (200 g), tranne che per:"),
        G("g_dolce", "Dolce", None, "porzione", [
            M("Sorbetto", 150), M("Yogurt", 125), M("Bibita analcolica", 33, "cl"),
            M("Frutta fresca a piacere", 300), M("Torta", 40), M("Crem caramel", 120),
            M("Gelato piccolo", 1, "pz"), M("Ghiacciolo", 2, "pz"), M("Cioccolato o Nutella", 30),
            M("Patatine fritte", 30), M("Birra media", 1, "pz"), M("Vino", 150, "ml"),
        ]),
    ]
    meals = [
        MEAL("m_mattina", "Mattina", "08:00", [O("A", [I("Caffè macchiato + tisana")])]),
        MEAL("m_pranzo", "Pranzo", "13:00", [
            O("A", [I("Pasta", 100, "g", "g_pasta"), I("Sugo vegetale", 100, "g", "g_sugo"),
                    I("Verdura a piacere", 100), I("Formaggio grattugiato", 10)], course="I"),
            O("B", [I("Lasagne", 280)], course="I"),
            O("C", [I("¾ Pizza Margherita o alle verdure oppure piadina con affettato e verdura o formaggio e verdura")],
              course="I", mx=1, note="max 1 volta alla settimana"),
            O("D", [I("Carne", 200, "g", "g_carne"), I("Verdura a piacere", 200),
                    I("Pane", 70, "g", "g_pane70")], course="II"),
            O("E", [I("Vellutata di verdure", 1, "piatto"), I("Formaggio grattugiato", 10),
                    I("Carne", 200, "g", "g_carne"), I("Verdura a piacere", 200),
                    I("Pane", 70, "g", "g_pane70")], course="II"),
            O("F", [I("Prosciutto crudo", 90), I("Melone", 200), I("Pane", 35)], course="II"),
        ], note="Verdure: mix al forno, pomodori grigliati"),
        MEAL("m_cena", "Cena", "20:00", [O("", [I("Verdure", 200)], kind="addon")], same_as="m_pranzo",
             note="Come a pranzo alternando le pietanze + verdure 200 g"),
        MEAL("m_extra", "Durante la giornata è possibile utilizzare", "", [O("", [
            I("Olio extravergine di oliva o burro", 30, "g", note="in totale nella giornata"),
            I("Dolce", None, "g", text="1 porzione", group="g_dolce", mx=2, note="max 2 volte alla settimana"),
        ])], kind="extras", required=False),
    ]
    return DietIn.model_validate({
        "name": "Piano alimentare - Bernardi Giorgia", "description": "Piano dimostrativo (da Giorgia.pdf)",
        "notes": "\n".join(NOTES + ["Acqua e limone sempre"]),
        "conversion": [{"name": n, "raw": r} for n, r in [
            ("Pasta", "100 g"), ("Orzo", "100 g"), ("Casoncelli", "150 g"), ("Quinoa", "100 g"),
            ("Farro", "100 g"), ("Cous cous", "100 g"), ("Riso", "100 g"), ("Gnocchi", "250 g")]],
        "groups": groups, "meals": meals})
