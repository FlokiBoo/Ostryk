'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
  Accueil client Ostryk — version v3.1 (relecture : états vides, statut dérivé de la date,
  contrastes AA, dates locales, accessibilité).
  Champs alignés sur le schéma réel : athletes.is_1to1_client, programs.listed_at,
  program_sessions.is_coached, coaching_schedule.starts_at.

  Le statut d'une séance n'est pas stocké : il se déduit de sa date et de `faite`
  (faite → "faite", passée → "manquee", aujourd'hui → "a_faire", future → "a_venir").
*/

const T = {
  beige: "#E8E0D5",
  blanc: "#FFFFFF",
  fond: "#F7F3EC",
  bordeaux: "#6D1A22",
  vert: "#2D3A30",
  ocre: "#A07A3F",
  texte: "#2D2620",
  texteSec: "#625B50", // ≥ 4.5:1 sur beige, nav et blanc
  texteCorps: "#5A5348",
  muted: "#B0A796",
  filet: "#CFC4B4",
  bordure: "#D9CFC1",
  clair: "#F5EFE6",
  nav: "#E1D8C9",
};

const TYPE_COULEUR = { force: T.bordeaux, endurance: T.vert, mobilite: T.ocre };
const TYPE_LABEL = { force: "Force", endurance: "Endurance", mobilite: "Mobilité" };
const STATUT_LABEL = { faite: "faite", manquee: "pas encore faite", a_faire: "à faire", a_venir: "à venir" };
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const LARGEUR_OBJECTIF = 300;
const GAP_OBJECTIF = 18;

const DEGRADES = ["linear-gradient(150deg,#3A4A3F,#232B26)", "linear-gradient(150deg,#8A3A40,#4A1219)"];

// "AAAA-MM-JJ" lu en heure locale (et non minuit UTC, qui décale d'un jour hors métropole).
function parseJour(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function aujourdhui() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
// Écart en jours calendaires ; Math.round absorbe les changements d'heure.
const ecartJours = (iso) => Math.round((parseJour(iso) - aujourdhui()) / 86400000);
const estAujourdhui = (iso) => ecartJours(iso) === 0;
const jourDuMois = (iso) => parseJour(iso).getDate();
const indexJour = (iso) => (parseJour(iso).getDay() + 6) % 7;

function statutSeance(date, seance) {
  if (seance.faite) return "faite";
  const e = ecartJours(date);
  if (e < 0) return "manquee";
  return e === 0 ? "a_faire" : "a_venir";
}

function dateLongue(iso) {
  return parseJour(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function dateCourte(iso) {
  return parseJour(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" });
}
// starts_at est un vrai horodatage : affiché dans le fuseau de l'appareil.
function heure(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function estNouveau(iso) {
  return iso && (Date.now() - new Date(iso)) / 86400000 < 30;
}

// Données de démonstration, calées sur la semaine en cours. Uniquement pour la prévisualisation :
// passer `{...demoAccueil}` explicitement, jamais en valeur par défaut.
function jourDeLaSemaine(n) {
  const d = aujourdhui();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const demoAccueil = {
  athlete: { id: "a1", prenom: "Camille", is_1to1_client: false },
  objectifs: [
    { id: "o1", titre: "Semi de Bordeaux", date: "2026-10-25" },
    { id: "o2", titre: "Premières tractions strictes", date: null },
  ],
  programme: { id: "p1", phase: "Développement", semaine: 3, duration_weeks: 8 },
  semaine: [
    {
      date: jourDeLaSemaine(0),
      seance: {
        id: "s1",
        titre: "Haut du corps",
        type: "force",
        faite: true,
        duree_min: 52,
        effort: "Ok",
        blocs: ["A · Développé couché, Tirage horizontal", "B · Dips, Face pull"],
      },
    },
    {
      date: jourDeLaSemaine(1),
      seance: {
        id: "s2",
        titre: "Footing 40 min",
        type: "endurance",
        duree_estimee_min: 40,
        blocs: ["Allure confortable, conversation possible"],
      },
    },
    {
      date: jourDeLaSemaine(2),
      seance: {
        id: "s3",
        titre: "Bas du corps",
        type: "force",
        duree_estimee_min: 55,
        blocs: [
          "A · Front squat, Nordic curl, Planche latérale",
          "B · Fentes bulgares, Hip thrust",
          "C · Air bike 40 cal",
        ],
      },
    },
    { date: jourDeLaSemaine(3), seance: null },
    {
      date: jourDeLaSemaine(4),
      seance: {
        id: "s4",
        titre: "Fractionné 6 × 800 m",
        type: "endurance",
        duree_estimee_min: 50,
        blocs: ["Échauffement 15 min", "6 × 800 m, récup 1 min 30", "Retour au calme 10 min"],
      },
    },
    {
      date: jourDeLaSemaine(5),
      seance: {
        id: "s5",
        titre: "Séance avec ton coach",
        type: "force",
        is_coached: true,
        starts_at: `${jourDeLaSemaine(5)}T10:00:00`,
        duree_estimee_min: 60,
        blocs: ["Bilan de mi-cycle et travail technique"],
      },
    },
    { date: jourDeLaSemaine(6), seance: null },
  ],
  programmes: [
    { id: "pr1", titre: "Hyrox Prép", duration_weeks: 8, recommended_sessions_per_week: 4, listed_at: "2026-09-10" },
    { id: "pr2", titre: "10K en 12 semaines", duration_weeks: 12, recommended_sessions_per_week: 3, listed_at: "2026-04-02" },
  ],
};

const libelleSection = {
  fontSize: 11,
  color: T.texteSec,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  margin: 0,
};

function CarteObjectif({ objectif }) {
  const jAvant = objectif.date ? ecartJours(objectif.date) : null;
  return (
    <article
      style={{
        flex: "none",
        width: LARGEUR_OBJECTIF,
        scrollSnapAlign: "start",
        borderTop: `1px solid ${T.filet}`,
        paddingTop: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ ...libelleSection, fontSize: 10, marginBottom: 5 }}>Objectif</p>
          <p
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: 19,
              color: T.bordeaux,
              lineHeight: 1.2,
              margin: "0 0 4px",
            }}
          >
            {objectif.titre}
          </p>
          {objectif.date ? (
            <p style={{ fontSize: 11, color: T.texteSec, margin: 0 }}>{dateLongue(objectif.date)}</p>
          ) : null}
        </div>
        {jAvant !== null ? (
          <p style={{ fontFamily: "Cinzel, serif", fontSize: 24, margin: 0 }}>J-{jAvant}</p>
        ) : null}
      </div>
    </article>
  );
}

function Pastille({ seance, statut }) {
  if (!seance) {
    return <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: T.filet }} />;
  }
  const couleur = TYPE_COULEUR[seance.type];
  // Séance avec le coach : anneau ocre autour de la pastille habituelle.
  const coach = seance.is_coached ? { outline: `1.5px solid ${T.ocre}`, outlineOffset: 2 } : null;
  if (statut === "faite") {
    return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: couleur, ...coach }} />;
  }
  const trait = statut === "manquee" ? "dashed" : "solid";
  const teinte = statut === "manquee" ? T.muted : couleur;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        border: `1.5px ${trait} ${teinte}`,
        boxSizing: "border-box",
        ...coach,
      }}
    />
  );
}

function descriptionJour({ date, seance }) {
  if (!seance) return `${dateLongue(date)}, repos`;
  const coach = seance.is_coached ? ", avec ton coach" : "";
  return `${dateLongue(date)}, ${seance.titre}${coach}, ${STATUT_LABEL[statutSeance(date, seance)]}`;
}

function CarteSeance({ entree, prochaine, onCommencer, onDecaler, onVoirPerformances }) {
  const { date, seance } = entree;

  if (!seance) {
    return (
      <div style={{ padding: "4px 4px 0" }}>
        <p style={{ fontSize: 11, color: T.texteSec, margin: "0 0 6px" }}>{dateLongue(date)}</p>
        <p style={{ fontFamily: "Cinzel, serif", fontSize: 26, lineHeight: 1.15, margin: "0 0 8px" }}>
          Jour de repos
        </p>
        <p style={{ fontSize: 13, color: T.texteCorps, margin: 0 }}>
          {prochaine
            ? `Prochaine séance : ${prochaine.seance.titre}, ${dateCourte(prochaine.date)}`
            : "Aucune séance à venir"}
        </p>
      </div>
    );
  }

  const statut = statutSeance(date, seance);
  const jour = statut === "a_faire";
  const fond = jour ? T.vert : T.blanc;
  const couleurTexte = jour ? T.clair : T.texte;
  const couleurSec = jour ? T.muted : T.texteSec;
  const fondBloc = jour ? "rgba(245,239,230,0.09)" : T.fond;

  const meta = seance.is_coached
    ? seance.starts_at
      ? heure(seance.starts_at)
      : "à planifier avec ton coach"
    : statut === "faite"
      ? `${seance.duree_min} min · effort ${seance.effort}`
      : `≈ ${seance.duree_estimee_min} minutes`;

  const boutonLeger = {
    width: "100%",
    marginTop: 16,
    background: "none",
    border: `1px solid ${T.bordure}`,
    borderRadius: 12,
    height: 46,
    fontSize: 13,
    color: T.texte,
  };

  let action;
  if (seance.is_coached) {
    action = (
      <p style={{ fontSize: 12, color: couleurSec, margin: "16px 0 0" }}>Cette séance se fait avec ton coach.</p>
    );
  } else if (jour) {
    action = (
      <>
        <button
          type="button"
          onClick={() => onCommencer(seance)}
          style={{
            width: "100%",
            marginTop: 18,
            background: T.clair,
            color: T.vert,
            border: "none",
            borderRadius: 12,
            height: 52,
            fontSize: 15,
          }}
        >
          Commencer la séance
        </button>
        <button
          type="button"
          onClick={() => onDecaler(seance)}
          style={{
            width: "100%",
            marginTop: 4,
            background: "none",
            border: "none",
            color: T.muted,
            fontSize: 12,
            textDecoration: "underline",
            height: 44,
          }}
        >
          Décaler
        </button>
      </>
    );
  } else if (statut === "manquee") {
    action = (
      <button
        type="button"
        onClick={() => onDecaler(seance)}
        style={{
          width: "100%",
          marginTop: 16,
          background: T.vert,
          color: T.clair,
          border: "none",
          borderRadius: 12,
          height: 48,
          fontSize: 13,
        }}
      >
        Décaler cette séance
      </button>
    );
  } else if (statut === "faite") {
    action = (
      <button type="button" onClick={() => onVoirPerformances(seance)} style={boutonLeger}>
        Voir mes performances
      </button>
    );
  } else {
    action = (
      <button type="button" onClick={() => onDecaler(seance)} style={boutonLeger}>
        Décaler
      </button>
    );
  }

  return (
    <div style={{ background: fond, borderRadius: 20, padding: "18px 16px", color: couleurTexte }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span
          aria-hidden="true"
          style={{ width: 7, height: 7, borderRadius: "50%", background: jour ? T.beige : TYPE_COULEUR[seance.type] }}
        />
        <span style={{ ...libelleSection, fontSize: 10, color: couleurSec }}>
          {TYPE_LABEL[seance.type]}
          {estAujourdhui(date) ? " · aujourd'hui" : ` · ${dateCourte(date)}`}
        </span>
        {seance.is_coached ? (
          <span style={{ fontSize: 10, color: couleurSec }}>· avec ton coach</span>
        ) : null}
        <span style={{ marginLeft: "auto", fontSize: 11, color: statut === "faite" ? T.vert : couleurSec }}>
          {statut === "faite" ? "✓ Faite" : statut === "manquee" ? "Pas encore faite" : ""}
        </span>
      </div>

      <h2 style={{ fontFamily: "Cinzel, serif", fontSize: 26, lineHeight: 1.15, margin: "0 0 6px", fontWeight: 600 }}>
        {seance.titre}
      </h2>
      <p style={{ fontSize: 12, color: couleurSec, margin: "0 0 16px" }}>{meta}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(seance.blocs || []).map((b, i) => (
          <p
            key={i}
            style={{
              fontSize: 12,
              background: fondBloc,
              borderRadius: 9,
              padding: "9px 11px",
              margin: 0,
              color: jour ? T.beige : T.texteCorps,
            }}
          >
            {b}
          </p>
        ))}
      </div>

      {action}
    </div>
  );
}

export default function AccueilClient({
  athlete = null,
  objectifs = [],
  programme = null,
  semaine = [],
  programmes = [],
  afficherNav = false, // l'intégration dans app/s/[token] garde sa propre barre (AthleteTabBar)
  ongletActif = "accueil",
  onCommencerSeance = () => {},
  onDecalerSeance = () => {},
  onVoirPerformances = () => {},
  onAjouterObjectif = () => {},
  onOuvrirProgramme = () => {},
  onChangerOnglet = () => {},
}) {
  const indexInitial = Math.max(0, semaine.findIndex((e) => estAujourdhui(e.date)));
  const [selection, setSelection] = useState(indexInitial);
  const [pageObjectif, setPageObjectif] = useState(0);
  const [railDefilable, setRailDefilable] = useState(false);
  const rail = useRef(null);

  // Objectifs passés masqués ; datés d'abord (du plus proche au plus lointain), puis sans date.
  const objectifsTries = useMemo(
    () =>
      objectifs
        .filter((o) => !o.date || ecartJours(o.date) >= 0)
        .sort((a, b) => {
          if (!a.date) return 1;
          if (!b.date) return -1;
          return parseJour(a.date) - parseJour(b.date);
        }),
    [objectifs]
  );

  const compteur = useMemo(() => {
    const prevues = semaine.filter((e) => e.seance).length;
    const faites = semaine.filter((e) => e.seance?.faite).length;
    return { faites, prevues };
  }, [semaine]);

  const indexCourant = Math.min(selection, semaine.length - 1);

  const prochaine = useMemo(
    () => semaine.slice(indexCourant + 1).find((e) => e.seance) || null,
    [semaine, indexCourant]
  );

  const nbCartes = objectifsTries.length + 1;
  const afficherProgrammes = !athlete?.is_1to1_client && programmes.length > 0;

  // En fin de défilement, le dernier point s'allume même si la dernière carte ne peut pas
  // s'aligner à gauche (écran large) ; les points disparaissent si tout tient à l'écran.
  const majPageObjectif = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setRailDefilable(max > 2);
    setPageObjectif(
      el.scrollLeft >= max - 2 ? nbCartes - 1 : Math.round(el.scrollLeft / (LARGEUR_OBJECTIF + GAP_OBJECTIF))
    );
  }, [nbCartes]);

  useEffect(() => {
    majPageObjectif();
    window.addEventListener("resize", majPageObjectif);
    return () => window.removeEventListener("resize", majPageObjectif);
  }, [majPageObjectif]);

  return (
    <div
      style={{
        background: T.beige,
        minHeight: "100vh",
        fontFamily: "'Work Sans', system-ui, sans-serif",
        color: T.texte,
        paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <p style={{ fontSize: 12, color: T.texteSec, margin: "0 18px 14px" }}>
        {athlete?.prenom ? `Bonjour ${athlete.prenom}` : "Bonjour"}
      </p>

      <div
        ref={rail}
        onScroll={majPageObjectif}
        style={{
          display: "flex",
          gap: GAP_OBJECTIF,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          padding: "0 18px",
          scrollbarWidth: "none",
        }}
      >
        {objectifsTries.map((o) => (
          <CarteObjectif key={o.id} objectif={o} />
        ))}
        <button
          type="button"
          onClick={onAjouterObjectif}
          style={{
            flex: "none",
            width: LARGEUR_OBJECTIF,
            scrollSnapAlign: "start",
            textAlign: "left",
            background: "none",
            border: "none",
            borderTop: `1px solid ${T.filet}`,
            padding: "14px 0 0",
            color: T.bordeaux,
            fontSize: 13,
          }}
        >
          + Ajouter un objectif
        </button>
      </div>

      {nbCartes > 1 && railDefilable ? (
        <div style={{ display: "flex", gap: 5, padding: "12px 18px 0" }} aria-hidden="true">
          {Array.from({ length: nbCartes }, (_, i) => (
            <span
              key={i}
              style={{
                width: i === pageObjectif ? 18 : 6,
                height: 4,
                borderRadius: 100,
                background: i === pageObjectif ? T.bordeaux : T.filet,
              }}
            />
          ))}
        </div>
      ) : null}

      <div style={{ height: 30 }} />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 18px", marginBottom: 12 }}>
        <h2 style={{ ...libelleSection, fontWeight: 400 }}>Cette semaine</h2>
        {semaine.length > 0 ? (
          <span style={{ fontSize: 11, color: T.texteSec }}>
            {compteur.faites} / {compteur.prevues}
            {programme ? ` · ${programme.phase.toLowerCase()}, semaine ${programme.semaine}` : ""}
          </span>
        ) : null}
      </div>

      {semaine.length === 0 ? (
        <p style={{ fontSize: 13, color: T.texteCorps, margin: "0 18px" }}>
          Aucune séance prévue cette semaine.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 2, padding: "0 14px", marginBottom: 22 }}>
            {semaine.map((e, i) => {
              const on = i === indexCourant;
              return (
                <button
                  key={e.date}
                  type="button"
                  aria-pressed={on}
                  aria-current={estAujourdhui(e.date) ? "date" : undefined}
                  aria-label={descriptionJour(e)}
                  onClick={() => setSelection(i)}
                  style={{
                    flex: 1,
                    border: "none",
                    background: "none",
                    padding: "8px 0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <span style={{ fontSize: 10, color: T.texteSec }}>{JOURS[indexJour(e.date)]}</span>
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      background: on ? T.texte : "transparent",
                      color: on ? T.clair : T.texte,
                    }}
                  >
                    {jourDuMois(e.date)}
                  </span>
                  <Pastille seance={e.seance} statut={e.seance ? statutSeance(e.date, e.seance) : null} />
                </button>
              );
            })}
          </div>

          <div style={{ padding: "0 14px" }}>
            <CarteSeance
              entree={semaine[indexCourant]}
              prochaine={prochaine}
              onCommencer={onCommencerSeance}
              onDecaler={onDecalerSeance}
              onVoirPerformances={onVoirPerformances}
            />
          </div>
        </>
      )}

      <div style={{ height: 30 }} />

      {afficherProgrammes ? (
        <>
          <h2 style={{ ...libelleSection, margin: "0 18px 12px", fontWeight: 400 }}>Programmes</h2>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 18px 4px", scrollbarWidth: "none" }}>
            {programmes.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOuvrirProgramme(p)}
                style={{
                  flex: "none",
                  width: 180,
                  textAlign: "left",
                  border: "none",
                  background: "none",
                  padding: 0,
                  marginRight: i === programmes.length - 1 ? 18 : 0,
                }}
              >
                <div
                  style={{
                    height: 104,
                    borderRadius: 14,
                    background: DEGRADES[i % DEGRADES.length],
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 10,
                  }}
                >
                  {estNouveau(p.listed_at) ? (
                    <span
                      style={{
                        background: T.bordeaux,
                        color: T.clair,
                        borderRadius: 100,
                        fontSize: 10,
                        padding: "2px 8px",
                      }}
                    >
                      Nouveau
                    </span>
                  ) : null}
                </div>
                <p style={{ fontFamily: "Cinzel, serif", fontSize: 14, margin: "9px 2px 2px" }}>{p.titre}</p>
                <p style={{ fontSize: 11, color: T.texteSec, margin: "0 2px" }}>
                  {p.duration_weeks} semaines · {p.recommended_sessions_per_week} séances
                </p>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <div style={{ height: 26, flex: 1 }} />

      {afficherNav ? (
        <nav
          aria-label="Navigation principale"
          style={{
            display: "flex",
            justifyContent: "space-around",
            background: T.nav,
            padding: "13px 0",
            paddingBottom: "calc(17px + env(safe-area-inset-bottom, 0px))",
            position: "sticky",
            bottom: 0,
          }}
        >
          {[
            { cle: "accueil", label: "Accueil" },
            { cle: "planning", label: "Planning" },
            { cle: "progres", label: "Progrès" },
            { cle: "profil", label: "Profil" },
          ].map((o) => (
            <button
              key={o.cle}
              type="button"
              aria-current={ongletActif === o.cle ? "page" : undefined}
              onClick={() => onChangerOnglet(o.cle)}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                color: ongletActif === o.cle ? T.bordeaux : T.texteSec,
                padding: "4px 12px",
              }}
            >
              {o.label}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
