'use client'

import { useMemo, useState } from "react";
import { ArrowLeft, CalendarBlank, CaretDown, CaretUp, ChatCircle, CheckCircle, Clock, NotePencil, Play, Target, TrendUp } from "@phosphor-icons/react";

/*
  Fiche sportif côté coach + mode coaching.
  Composant présentationnel : les données arrivent par props, les écritures sortent par callbacks.
  Rien n'est branché tant que les lots 4, 7 et 8 de docs/audit-schema-2026-09.md ne sont pas passés
  en base — is_coached, customized_at, coaching_schedule.starts_at, et sur program_exercise_sets
  kg_prescribed / reps_prescribed / entered_by_role n'existent pas encore.

  Champs déjà réels : athletes.is_1to1_client, programs.athlete_days_of_week (smallint[], 0 = lundi),
  programs.duration_weeks, program_exercise_sets.{kg_done, reps_done}.

  seance.saisie_coach est DÉRIVÉ, pas une colonne : entered_by_role vit sur program_exercise_sets,
  une valeur par série. C'est à l'appelant d'agréger (toutes les séries saisies par le coach), parce
  que program_completions n'a pas de colonne équivalente.

  Style : ce fichier garde les doubles quotes et les points-virgules de son fichier d'origine, et sa
  palette locale T au lieu des variables CSS de globals.css. À aligner si on le reprend en profondeur.
*/

const T = {
  page: "#EFEAE0",
  blanc: "#FFFFFF",
  fond: "#F7F3EC",
  bordeaux: "#6D1A22",
  vert: "#2D3A30",
  ocre: "#A07A3F",
  texte: "#2D2620",
  texteSec: "#8a8378",
  texteCorps: "#5A5348",
  muted: "#B0A796",
  bordure: "#D9CFC1",
  bordureLegere: "#F0EBE2",
  clair: "#F5EFE6",
  vertBg: "#E6EAE5",
  neutreBg: "#EFE8DE",
};

const TYPE_COULEUR = { force: T.bordeaux, endurance: T.vert, mobilite: T.ocre };
const TYPE_LABEL = { force: "Force", endurance: "Endurance", mobilite: "Mobilité" };
const JOURS_COURTS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

const demo = {
  athlete: {
    id: "a1",
    nom: "Camille Mercier",
    is_1to1_client: true,
    groupes: ["Hyrox"],
    objectifs: [
      { id: "o1", titre: "Semi de Bordeaux", date: "2026-10-25" },
      { id: "o2", titre: "Premières tractions strictes", date: null },
    ],
  },
  programme: {
    id: "p1",
    titre: "10K en 12 semaines",
    duration_weeks: 12,
    semaine_courante: 3,
    athlete_days_of_week: [0, 2, 4, 5],
    fin_estimee: "2026-12-07",
  },
  stats: {
    semaineFaites: 2,
    semainePrevues: 4,
    quatreSemaines: [
      { faites: 4, prevues: 4 },
      { faites: 3, prevues: 4 },
      { faites: 4, prevues: 4 },
      { faites: 2, prevues: 4 },
    ],
    effortMoyen: "Ok",
  },
  seances: [
    {
      id: "s1",
      titre: "Bas du corps",
      type: "force",
      statut: "faite",
      date: "2026-09-17",
      duree_min: 55,
      effort: "Dur",
      saisie_coach: false,
      is_coached: false,
      customized_at: null,
      blocs: [
        {
          id: "A",
          tours: 4,
          exercices: [
            {
              id: "e1",
              nom: "Front squat",
              unite: "kg",
              pas: 2.5,
              prescrit: [
                { kg: 62.5, reps: 8 },
                { kg: 62.5, reps: 8 },
                { kg: 65, reps: 8 },
                { kg: 67.5, reps: 6 },
              ],
              realise: [
                { kg: 62.5, reps: 8 },
                { kg: 62.5, reps: 8 },
                { kg: 65, reps: 7 },
                { kg: 65, reps: 6 },
              ],
            },
            {
              id: "e2",
              nom: "Nordic curl",
              unite: null,
              prescrit: [{ reps: 6 }, { reps: 6 }, { reps: 6 }, { reps: 6 }],
              realise: [{ reps: 6 }, { reps: 6 }, { reps: 5 }, { reps: 5 }],
            },
          ],
        },
      ],
    },
    {
      id: "s2",
      titre: "Footing 40 min",
      type: "endurance",
      statut: "manquee",
      date: "2026-09-16",
      is_coached: false,
      blocs: [{ id: "A", texte: "40 min allure confortable, conversation possible" }],
    },
    {
      id: "s3",
      titre: "Haut du corps",
      type: "force",
      statut: "faite",
      date: "2026-09-15",
      duree_min: 52,
      effort: "Ok",
      saisie_coach: true,
      is_coached: true,
      blocs: [
        {
          id: "A",
          tours: 3,
          exercices: [
            {
              id: "e3",
              nom: "Développé couché",
              unite: "kg",
              pas: 2.5,
              prescrit: [
                { kg: 50, reps: 8 },
                { kg: 50, reps: 8 },
                { kg: 52.5, reps: 8 },
              ],
              realise: [
                { kg: 50, reps: 8 },
                { kg: 52.5, reps: 8 },
                { kg: 52.5, reps: 8 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "s4",
      titre: "Mobilité hanches",
      type: "mobilite",
      statut: "faite",
      date: "2026-09-13",
      duree_min: 24,
      effort: "Facile",
      saisie_coach: false,
      blocs: [{ id: "A", texte: "Circuit 3 tours, 6 mouvements" }],
    },
    {
      id: "s5",
      titre: "Bas du corps — S4",
      type: "force",
      statut: "a_venir",
      date: "2026-09-19",
      duree_estimee_min: 55,
      is_coached: true,
      starts_at: null,
      customized_at: null,
      blocs: [
        {
          id: "A",
          tours: 4,
          exercices: [
            {
              id: "e4",
              nom: "Front squat",
              unite: "kg",
              pas: 2.5,
              prescrit: [
                { kg: 65, reps: 8 },
                { kg: 65, reps: 8 },
                { kg: 67.5, reps: 6 },
                { kg: 67.5, reps: 6 },
              ],
            },
            {
              id: "e5",
              nom: "Nordic curl",
              unite: null,
              prescrit: [{ reps: 6 }, { reps: 6 }, { reps: 6 }, { reps: 6 }],
            },
            {
              id: "e6",
              nom: "Planche latérale",
              unite: null,
              uniteReps: "s",
              prescrit: [{ reps: 40 }, { reps: 40 }, { reps: 40 }, { reps: 40 }],
            },
          ],
        },
        {
          id: "B",
          tours: 3,
          exercices: [
            {
              id: "e7",
              nom: "Fentes bulgares",
              unite: "kg",
              pas: 2,
              prescrit: [
                { kg: 16, reps: 10 },
                { kg: 16, reps: 10 },
                { kg: 16, reps: 10 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "s6",
      titre: "Fractionné 6 × 800 m",
      type: "endurance",
      statut: "a_venir",
      date: "2026-09-19",
      duree_estimee_min: 50,
      is_coached: false,
      customized_at: "2026-09-18T10:00:00Z",
      blocs: [{ id: "A", texte: "Échauffement 15 min, 6 × 800 m récup 1 min 30, retour au calme" }],
    },
  ],
};

function fmt(v) {
  if (v === null || v === undefined) return "—";
  return (Math.round(v * 10) / 10).toString().replace(".", ",");
}

function dateCourte(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function dateHeure(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function joursAvant(iso) {
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

// coaching_schedule.date est not null : on la dérive de l'horaire choisi, en heure locale
// (toISOString décalerait la date d'un jour pour les rendez-vous de fin de soirée).
function dateLocale(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Un bloc peut compter plus de tours que l'exercice n'a de séries prescrites : on retombe alors
// sur la dernière prescription connue au lieu de lire hors du tableau.
function prescriptionDe(ex, i) {
  const p = ex.prescrit;
  if (!p?.length) return null;
  return p[Math.min(i, p.length - 1)];
}

function volume(v, avecCharge) {
  if (!v) return 0;
  return avecCharge ? (v.kg || 0) * (v.reps || 0) : v.reps || 0;
}

const carte = {
  background: T.blanc,
  border: `1px solid ${T.bordureLegere}`,
  borderRadius: 16,
  padding: 16,
  boxShadow: `0 6px 18px ${T.bordureLegere}`,
};
const titreSection = { fontFamily: "Cinzel, serif", fontSize: 15, margin: 0, letterSpacing: "-0.01em" };
const titreEncart = { fontFamily: "Cinzel, serif", fontSize: 12, color: T.bordeaux, margin: "0 0 10px", letterSpacing: "0.02em" };

function Bouton({ children, principal, onClick, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      style={{
        border: principal ? "none" : `1px solid ${T.bordure}`,
        background: principal ? T.bordeaux : T.blanc,
        color: principal ? T.clair : T.texte,
        borderRadius: 12,
        padding: "0 15px",
        minHeight: 44,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        boxShadow: principal ? `0 5px 12px ${T.bordureLegere}` : "none",
        ...(rest.style || {}),
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children, variante = "neutre" }) {
  const styles = {
    neutre: { background: T.neutreBg, color: T.texteCorps },
    vert: { background: T.vertBg, color: T.vert },
    bordeaux: { background: T.bordeaux, color: T.clair },
    pointille: { background: "transparent", color: T.texteSec, border: `1px dashed ${T.muted}` },
  };
  return (
    <span
      style={{
        ...styles[variante],
        borderRadius: 100,
        fontSize: 10,
        fontWeight: 600,
        padding: "5px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* ---------- Aperçu d'une séance ---------- */

function PlanifierCoaching({ seance, onPlanifier }) {
  const [valeur, setValeur] = useState(seance.starts_at ? seance.starts_at.slice(0, 16) : "");
  const [enCours, setEnCours] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        background: T.fond,
        borderRadius: 8,
        padding: "8px 10px",
        marginTop: 8,
      }}
    >
      <label style={{ fontSize: 12, color: T.texteCorps }} htmlFor={`rdv-${seance.id}`}>
        Rendez-vous
      </label>
      <input
        id={`rdv-${seance.id}`}
        type="datetime-local"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        style={{
          border: `1px solid ${T.bordure}`,
          borderRadius: 8,
          height: 34,
          padding: "0 8px",
          fontFamily: "inherit",
          fontSize: 12,
          color: T.texte,
          background: T.blanc,
        }}
      />
      <Bouton
        principal
        disabled={!valeur || enCours}
        onClick={async () => {
          setEnCours(true);
          try {
            const quand = new Date(valeur);
            await onPlanifier({
              program_session_id: seance.id,
              starts_at: quand.toISOString(),
              date: dateLocale(quand),
            });
          } finally {
            setEnCours(false);
          }
        }}
        style={{ height: 34, opacity: !valeur ? 0.5 : 1 }}
      >
        <><CalendarBlank size={15} />{seance.starts_at ? "Déplacer" : "Planifier"}</>
      </Bouton>
    </div>
  );
}

function ApercuSeance({ seance, onLancer, onPersonnaliser, onRevenirVersionProgramme, onPlanifier }) {
  const faite = seance.statut === "faite";
  const aDesExercices = seance.blocs.some((b) => b.exercices);

  return (
    <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {seance.blocs.map((b) =>
          b.texte ? (
            <p
              key={b.id}
              style={{ fontSize: 12, background: T.fond, borderRadius: 8, padding: "8px 10px", margin: 0 }}
            >
              {b.texte}
            </p>
          ) : (
            <div key={b.id} style={{ background: T.fond, borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontSize: 11, color: T.texteSec, margin: "0 0 4px" }}>
                Bloc {b.id} · {b.tours} tour{b.tours > 1 ? "s" : ""}
              </p>
              {b.exercices.map((ex) => {
                const avecCharge = ex.unite === "kg";
                const valeurs = faite && ex.realise ? ex.realise : ex.prescrit;
                return (
                  <div
                    key={ex.id}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", flexWrap: "wrap" }}
                  >
                    <span style={{ fontSize: 12, flex: "1 1 130px" }}>{ex.nom}</span>
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {valeurs.map((v, i) => {
                        let couleur = T.texte;
                        let fleche = null;
                        if (faite && ex.realise && ex.prescrit[i]) {
                          const r = volume(v, avecCharge);
                          const p = volume(ex.prescrit[i], avecCharge);
                          if (r < p) {
                            couleur = T.bordeaux;
                            fleche = "↓";
                          } else if (r > p) {
                            couleur = T.vert;
                            fleche = "↑";
                          }
                        }
                        const texte = avecCharge
                          ? `${fmt(v.kg)}×${v.reps}`
                          : `${v.reps}${ex.uniteReps ? " " + ex.uniteReps : ""}`;
                        return (
                          <span key={i} style={{ fontSize: 11, color: couleur, minWidth: 54 }}>
                            {texte}
                            {fleche ? <span aria-hidden="true"> {fleche}</span> : null}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {faite ? (
        <p style={{ fontSize: 10, color: T.muted, margin: "6px 0 0" }}>
          Valeurs réalisées · bordeaux = sous la prescription, vert = au-dessus
        </p>
      ) : null}

      {seance.is_coached && !faite ? <PlanifierCoaching seance={seance} onPlanifier={onPlanifier} /> : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {!faite && seance.customized_at ? (
          <Bouton onClick={() => onRevenirVersionProgramme(seance)}>Revenir à la version du programme</Bouton>
        ) : null}
        {!faite ? <Bouton onClick={() => onPersonnaliser(seance)}>Modifier pour ce client</Bouton> : null}
        {aDesExercices ? (
          <Bouton principal={!faite} onClick={() => onLancer(seance)}>
            {faite ? <><NotePencil size={16} />Modifier la saisie</> : <><Play size={16} weight="fill" />Lancer le coaching</>}
          </Bouton>
        ) : null}
      </div>
    </div>
  );
}

function LigneSeance({ seance, ouverte, onBasculer, ...actions }) {
  const couleur = TYPE_COULEUR[seance.type];
  const estFaite = seance.statut === "faite";
  const estManquee = seance.statut === "manquee";
  let meta;
  if (estFaite) {
    meta = `${seance.duree_min || "—"} min · ${seance.effort || "—"}`;
  } else if (estManquee) {
    meta = "Séance non réalisée";
  } else if (seance.is_coached) {
    meta = seance.starts_at ? dateHeure(seance.starts_at) : "À planifier";
  } else {
    meta = `≈ ${seance.duree_estimee_min || "—"} min`;
  }

  return (
    <div
      style={{
        ...carte,
        padding: 0,
        overflow: "hidden",
        opacity: estManquee ? 0.78 : 1,
        cursor: "pointer",
      }}
      onClick={onBasculer}
    >
      <div style={{ display: "flex", alignItems: "stretch", minHeight: 72 }}>
        <div style={{ width: 4, background: couleur, flex: "none" }} role="img" aria-label={TYPE_LABEL[seance.type]} />
        <div style={{ flex: 1, minWidth: 0, padding: "13px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: T.texteSec, fontWeight: 600 }}>{dateCourte(seance.date)}</span>
            {seance.is_coached ? <Badge variante="bordeaux">Coachée</Badge> : null}
            {seance.customized_at && !estFaite ? <Badge>Personnalisée</Badge> : null}
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, margin: "5px 0 3px", color: estManquee ? T.texteSec : T.texte }}>
            {seance.titre}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {estFaite ? <CheckCircle size={15} weight="fill" color={T.vert} /> : null}
            <span style={{ fontSize: 11, color: estFaite && seance.effort === "Dur" ? T.bordeaux : T.texteSec }}>{meta}</span>
            {seance.saisie_coach ? <Badge variante="vert">Saisie coach</Badge> : null}
          </div>
        </div>
        <div style={{ width: 44, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted }}>
          {ouverte ? <CaretUp size={18} /> : <CaretDown size={18} />}
        </div>
      </div>
      {ouverte ? <div style={{ padding: "0 14px 14px" }}><ApercuSeance seance={seance} {...actions} /></div> : null}
    </div>
  );
}

/* ---------- Mode coaching ---------- */

export function SeanceCoaching({ athlete, seance, onEnregistrerSerie, onEnregistrerNote, onTerminer, onRetour }) {
  const blocs = seance.blocs.filter((b) => b.exercices);
  const faite = seance.statut === "faite";
  const [debut] = useState(() => Date.now());
  const [blocIdx, setBlocIdx] = useState(0);
  const [tours, setTours] = useState(() => Object.fromEntries(blocs.map((b) => [b.id, 1])));
  const [notes, setNotes] = useState(() =>
    Object.fromEntries(blocs.flatMap((b) => b.exercices.map((e) => [e.id, e.note_privee || ""])))
  );
  const [notesOuvertes, setNotesOuvertes] = useState({});
  const [valeurs, setValeurs] = useState(() => {
    const out = {};
    blocs.forEach((b) =>
      b.exercices.forEach((e) => {
        for (let i = 0; i < (b.tours || 1); i++) {
          const p = prescriptionDe(e, i);
          if (!p) continue;
          const src = (faite && e.realise?.[i]) || p;
          out[`${e.id}|${i}`] = { kg: src.kg ?? null, reps: src.reps, touche: faite, modifie: false };
        }
      })
    );
    return out;
  });

  const bloc = blocs[blocIdx];
  const tour = tours[bloc.id];
  const nbTours = bloc.tours || 1;

  function maj(ex, champ, delta) {
    const cle = `${ex.id}|${tour - 1}`;
    setValeurs((prev) => {
      const v = prev[cle];
      if (!v) return prev;
      const pasReps = ex.uniteReps === "s" ? 5 : 1;
      const next = {
        ...v,
        kg: champ === "kg" ? Math.max(0, (v.kg || 0) + delta * (ex.pas || 1)) : v.kg,
        reps: champ === "reps" ? Math.max(1, v.reps + delta * pasReps) : v.reps,
        touche: true,
        modifie: true,
      };
      return { ...prev, [cle]: next };
    });
  }

  function enregistrerTour() {
    const i = tour - 1;
    bloc.exercices.forEach((ex) => {
      const v = valeurs[`${ex.id}|${i}`];
      const p = prescriptionDe(ex, i);
      if (!v || !p) return;
      // En reprise de saisie, ne pas réécrire les séries que le coach n'a pas touchées : elles
      // restent créditées au sportif (entered_by_role côté program_exercise_sets).
      if (faite && !v.modifie) return;
      onEnregistrerSerie({
        program_exercise_id: ex.id,
        athlete_id: athlete.id,
        set_index: i,
        kg_done: ex.unite === "kg" ? v.kg : null,
        reps_done: String(v.reps),
        kg_prescribed: ex.unite === "kg" ? p.kg : null,
        reps_prescribed: String(p.reps),
        entered_by_role: "coach",
      });
    });
  }

  const dernierBloc = blocIdx === blocs.length - 1;
  const dernierTour = tour === nbTours;
  const libelle = !dernierTour
    ? `Passer au tour ${tour + 1}`
    : dernierBloc
      ? "Terminer la séance"
      : `Passer au bloc ${blocs[blocIdx + 1].id}`;

  function suivant() {
    enregistrerTour();
    if (!dernierTour) {
      setTours((t) => ({ ...t, [bloc.id]: tour + 1 }));
      return;
    }
    if (!dernierBloc) {
      setBlocIdx(blocIdx + 1);
      return;
    }
    // program_completions n'a pas de colonne de rôle : la durée s'écrit dans duration_minutes,
    // et « saisie coach » se déduit des séries.
    onTerminer({
      program_session_id: seance.id,
      duration_minutes: Math.max(1, Math.round((Date.now() - debut) / 60000)),
    });
  }

  const stepper = (ex, champ, valeur, suffixe, touche) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: T.fond,
        borderRadius: 100,
        padding: 4,
      }}
    >
      <button
        type="button"
        aria-label={`Diminuer ${champ === "kg" ? "la charge" : "les répétitions"} sur ${ex.nom}`}
        onClick={() => maj(ex, champ, -1)}
        style={{ width: 44, height: 44, border: `1px solid ${T.bordureLegere}`, borderRadius: "50%", background: T.blanc, color: T.vert, fontSize: 18, cursor: "pointer" }}
      >
        −
      </button>
      <span
        style={{
          fontFamily: "Cinzel, serif",
          fontSize: 17,
          minWidth: 52,
          textAlign: "center",
          color: touche ? T.texte : T.muted,
        }}
      >
        {champ === "kg" ? fmt(valeur) : valeur}
      </span>
      <button
        type="button"
        aria-label={`Augmenter ${champ === "kg" ? "la charge" : "les répétitions"} sur ${ex.nom}`}
        onClick={() => maj(ex, champ, 1)}
        style={{ width: 44, height: 44, border: `1px solid ${T.bordureLegere}`, borderRadius: "50%", background: T.blanc, color: T.vert, fontSize: 18, cursor: "pointer" }}
      >
        +
      </button>
      <span style={{ fontSize: 10, color: T.muted, paddingRight: 6 }}>{suffixe}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 460, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          aria-label="Retour à la fiche"
          onClick={onRetour}
          style={{ background: T.blanc, border: `1px solid ${T.bordure}`, borderRadius: 12, width: 44, height: 44, color: T.vert, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, color: T.texteSec, margin: 0 }}>Coaching · {athlete.nom}</p>
          <p style={{ fontFamily: "Cinzel, serif", fontSize: 16, color: T.bordeaux, margin: "2px 0 0" }}>
            {seance.titre}
          </p>
        </div>
        <span style={{ background: T.vert, color: T.clair, borderRadius: 100, fontSize: 10, padding: "4px 10px" }}>
          Mode coach
        </span>
      </div>

      <nav style={{ display: "flex", gap: 6, marginBottom: 12 }} aria-label="Blocs de la séance">
        {blocs.map((b, i) => (
          <button
            key={b.id}
            type="button"
            aria-current={i === blocIdx}
            onClick={() => setBlocIdx(i)}
            style={{
              flex: 1,
              border: "none",
              borderRadius: 100,
              height: 44,
              fontSize: 12,
              background: i === blocIdx ? T.bordeaux : T.blanc,
              color: i === blocIdx ? T.clair : T.texte,
            }}
          >
            Bloc {b.id}
          </button>
        ))}
      </nav>

      <p style={{ fontFamily: "Cinzel, serif", fontSize: 13, textAlign: "center", margin: "0 0 8px" }}>
        Bloc {bloc.id} · tour {tour}/{nbTours}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bloc.exercices.map((ex) => {
          const v = valeurs[`${ex.id}|${tour - 1}`];
          if (!v) return null;
          const noteVisible = notesOuvertes[ex.id] || notes[ex.id];
          return (
            <section key={ex.id} style={{ ...carte, padding: 16, boxShadow: "none" }}>
              <p style={{ fontSize: 14, margin: "0 0 8px" }}>{ex.nom}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ex.unite === "kg" ? stepper(ex, "kg", v.kg, "kg", v.touche) : null}
                {stepper(ex, "reps", v.reps, ex.uniteReps || "reps", v.touche)}
              </div>
              {noteVisible ? (
                <textarea
                  rows={2}
                  value={notes[ex.id]}
                  placeholder={`Note privée sur ${ex.nom.toLowerCase()}…`}
                  aria-label={`Note privée sur ${ex.nom}`}
                  onChange={(e) => setNotes((n) => ({ ...n, [ex.id]: e.target.value }))}
                  onBlur={() =>
                    onEnregistrerNote({
                      program_session_id: seance.id,
                      program_exercise_id: ex.id,
                      texte: notes[ex.id],
                    })
                  }
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginTop: 8,
                    border: `1px solid ${T.bordure}`,
                    borderRadius: 8,
                    padding: 8,
                    fontFamily: "inherit",
                    fontSize: 12,
                    color: T.texte,
                    background: T.fond,
                    resize: "vertical",
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setNotesOuvertes((o) => ({ ...o, [ex.id]: true }))}
                  style={{ marginTop: 8, background: "none", border: "none", color: T.texteSec, fontSize: 12, padding: 0 }}
                >
                  + Ajouter une note
                </button>
              )}
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={suivant}
        style={{
          width: "100%",
          marginTop: 12,
          border: "none",
          borderRadius: 12,
          height: 52,
          fontSize: 15,
          background: T.bordeaux,
          color: T.clair,
        }}
      >
        {libelle}
      </button>
      <p style={{ fontSize: 10, color: T.muted, textAlign: "center", margin: "8px 0 0" }}>
        Valeurs grises = prescription non modifiée · notes privées, non visibles par le sportif
      </p>
    </div>
  );
}

/* ---------- Fiche sportif ---------- */

export default function FicheSportifCoach({
  athlete = demo.athlete,
  programme = demo.programme,
  stats = demo.stats,
  seances = demo.seances,
  onEnregistrerSerie = () => {},
  onEnregistrerNote = () => {},
  onTerminerCoaching = () => {},
  onPlanifierCoaching = () => {},
  onPersonnaliser = () => {},
  onRevenirVersionProgramme = () => {},
  onVoirHistorique = () => {},
  onMessage = () => {},
}) {
  const [onglet, setOnglet] = useState("recentes");
  const [ouverteId, setOuverteId] = useState(null);
  const [coaching, setCoaching] = useState(null);

  const { recentes, aVenir } = useMemo(() => {
    const passees = seances
      .filter((s) => s.statut === "faite" || s.statut === "manquee")
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 4);
    const futures = seances
      .filter((s) => s.statut === "a_venir")
      .sort((a, b) => new Date(a.starts_at || a.date) - new Date(b.starts_at || b.date));
    return { recentes: passees, aVenir: futures };
  }, [seances]);

  const initiales = athlete.nom
    .split(" ")
    .map((m) => m[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (coaching) {
    return (
      <div
        style={{
          background: T.page,
          minHeight: "100vh",
          padding: "16px 16px calc(24px + env(safe-area-inset-bottom))",
          fontFamily: "'Work Sans', system-ui, sans-serif",
          color: T.texte,
        }}
      >
        <SeanceCoaching
          athlete={athlete}
          seance={coaching}
          onEnregistrerSerie={onEnregistrerSerie}
          onEnregistrerNote={onEnregistrerNote}
          onRetour={() => setCoaching(null)}
          onTerminer={async (payload) => {
            await onTerminerCoaching(payload);
            setCoaching(null);
            setOnglet("recentes");
            setOuverteId(payload.program_session_id);
          }}
        />
      </div>
    );
  }

  const liste = onglet === "recentes" ? recentes : aVenir;
  const objectifs = [...(athlete.objectifs || [])].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date) - new Date(b.date);
  });
  const avancement = Math.round(((programme.semaine_courante - 1) / programme.duration_weeks) * 100);

  const actions = {
    onLancer: (s) => setCoaching(s),
    onPersonnaliser,
    onRevenirVersionProgramme,
    // coach_id n'est pas envoyé : la policy d'insert de coaching_schedule impose coach_id = auth.uid().
    onPlanifier: (payload) => onPlanifierCoaching({ ...payload, athlete_id: athlete.id }),
  };

  return (
    <div
      style={{
        background: T.page,
        minHeight: "100vh",
        padding: "20px 16px calc(32px + env(safe-area-inset-bottom))",
        fontFamily: "'Work Sans', system-ui, sans-serif",
        color: T.texte,
      }}
    >
      <header style={{ ...carte, display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap", padding: 14 }}>
        <span
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: T.bordeaux,
            color: T.clair,
            fontFamily: "Cinzel, serif",
            fontSize: 15,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          {initiales}
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "Cinzel, serif", fontSize: 20, color: T.bordeaux, margin: 0, fontWeight: 600 }}>
              {athlete.nom}
            </h1>
            {athlete.is_1to1_client ? <Badge variante="bordeaux">Suivi 1:1</Badge> : null}
          </div>
          <p style={{ fontSize: 12, color: T.texteSec, margin: "3px 0 0" }}>
            {programme.titre} · semaine {programme.semaine_courante}/{programme.duration_weeks}
            {programme.athlete_days_of_week?.length
              ? " · " + programme.athlete_days_of_week.map((j) => JOURS_COURTS[j]).join(", ")
              : ""}
          </p>
        </div>
        <Bouton onClick={onMessage}><ChatCircle size={17} weight="bold" />Message</Bouton>
      </header>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <main style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 18 }}>
            <div style={{ ...carte }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><TrendUp size={16} color={T.bordeaux} /><p style={{ fontSize: 11, color: T.texteSec, margin: 0 }}>Cette semaine</p></div>
              <p style={{ fontFamily: "Cinzel, serif", fontSize: 18, margin: "2px 0 0" }}>
                {stats.semaineFaites}
                <span style={{ fontSize: 13, color: T.texteSec }}>/{stats.semainePrevues}</span>
              </p>
            </div>
            <div style={{ ...carte }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Clock size={16} color={T.vert} /><p style={{ fontSize: 11, color: T.texteSec, margin: 0 }}>4 dernières semaines</p></div>
              <div
                style={{ display: "flex", gap: 3, marginTop: 8 }}
                aria-label={stats.quatreSemaines.map((s) => `${s.faites} sur ${s.prevues}`).join(", ")}
              >
                {stats.quatreSemaines.map((s, i) => {
                  const pct = s.prevues ? Math.round((s.faites / s.prevues) * 100) : 0;
                  return (
                    <span
                      key={i}
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 100,
                        background: `linear-gradient(90deg, ${T.vert} ${pct}%, ${T.bordure} ${pct}%)`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div style={{ ...carte }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Target size={16} color={T.ocre} /><p style={{ fontSize: 11, color: T.texteSec, margin: 0 }}>Effort moyen</p></div>
              <p style={{ fontFamily: "Cinzel, serif", fontSize: 18, margin: "2px 0 0", color: T.bordeaux }}>
                {stats.effortMoyen || "—"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <h2 style={{ ...titreSection, marginRight: "auto", fontWeight: 600 }}>Séances</h2>
            {[
              { cle: "recentes", label: "Récentes" },
              { cle: "a_venir", label: "À venir" },
            ].map((o) => (
              <button
                key={o.cle}
                type="button"
                aria-pressed={onglet === o.cle}
                onClick={() => {
                  setOnglet(o.cle);
                  setOuverteId(null);
                }}
                style={{
                  border: "none",
                  borderRadius: 100,
                  padding: "6px 14px",
                  fontSize: 12,
                  background: onglet === o.cle ? T.texte : T.blanc,
                  color: onglet === o.cle ? T.clair : T.texte,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {liste.length === 0 ? (
              <p style={{ fontSize: 12, color: T.texteSec, margin: 0 }}>
                {onglet === "recentes" ? "Aucune séance passée." : "Aucune séance à venir."}
              </p>
            ) : (
              liste.map((s) => (
                <LigneSeance
                  key={s.id}
                  seance={s}
                  ouverte={ouverteId === s.id}
                  onBasculer={() => setOuverteId(ouverteId === s.id ? null : s.id)}
                  {...actions}
                />
              ))
            )}
          </div>

          {onglet === "recentes" ? (
            <button
              type="button"
              onClick={onVoirHistorique}
              style={{
                marginTop: 10,
                background: "none",
                border: "none",
                color: T.texteSec,
                fontSize: 12,
                textDecoration: "underline",
                padding: 0,
              }}
            >
              Voir tout l&apos;historique
            </button>
          ) : null}
        </main>

        <aside style={{ flex: "1 1 280px", minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={carte}>
            <p style={{ ...titreEncart, display: "flex", alignItems: "center", gap: 7 }}><Target size={15} />Objectifs du sportif</p>
            {objectifs.length === 0 ? (
              <p style={{ fontSize: 12, color: T.texteSec, margin: 0 }}>Aucun objectif renseigné.</p>
            ) : (
              objectifs.map((o, i) => (
                <div key={o.id} style={{ marginTop: i ? 8 : 0 }}>
                  <p style={{ fontSize: 13, margin: 0 }}>{o.titre}</p>
                  <p style={{ fontSize: 11, color: T.texteSec, margin: "2px 0 0" }}>
                    {o.date
                      ? `${new Date(o.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} · J-${joursAvant(o.date)}`
                      : "Sans date"}
                  </p>
                </div>
              ))
            )}
          </div>

          <div style={carte}>
            <p style={{ ...titreEncart, display: "flex", alignItems: "center", gap: 7 }}><TrendUp size={15} />Programme</p>
            <p style={{ fontSize: 13, margin: 0 }}>{programme.titre}</p>
            <div
              role="progressbar"
              aria-valuenow={avancement}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: 6, borderRadius: 100, background: T.neutreBg, margin: "8px 0 4px" }}
            >
              <div style={{ width: `${avancement}%`, height: 6, borderRadius: 100, background: T.bordeaux }} />
            </div>
            {programme.fin_estimee ? (
              <p style={{ fontSize: 11, color: T.texteSec, margin: 0 }}>
                Fin estimée le{" "}
                {new Date(programme.fin_estimee).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </p>
            ) : null}
          </div>

          {athlete.groupes?.length ? (
            <div style={carte}>
              <p style={titreEncart}>Groupes</p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {athlete.groupes.map((g) => (
                  <Badge key={g} variante="vert">
                    {g}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
