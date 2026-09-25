'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
  Accueil client Ostryk — v3 de la maquette, branchée sur le modèle réel des séances.

  L'app ne date pas les séances : chaque programme propose sa PROCHAINE séance non faite, le jour
  prévu n'est qu'une indication (voir WodTab, qui construit les données). La bande de la semaine
  montre donc ce qui a été fait (date de validation) et ce qui est prévu sur les jours à venir —
  jamais de séance "manquée" : une séance en retard est simplement proposée aujourd'hui.

  Statut d'une séance, déduit de sa date et de `faite` : faite → "faite", aujourd'hui → "a_faire",
  future → "a_venir" (et "manquee" pour une date passée non faite, que WodTab ne produit pas).
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

const TITRE = "var(--font-title)";

const TYPE_COULEUR = { force: T.bordeaux, endurance: T.vert, mobilite: T.ocre };
const TYPE_LABEL = { force: "Force", endurance: "Endurance", mobilite: "Mobilité" };
const STATUT_LABEL = { faite: "faite", manquee: "pas encore faite", a_faire: "à faire", a_venir: "à venir" };
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const LARGEUR_OBJECTIF = 300;
const GAP_OBJECTIF = 18;

const DEGRADES = ["linear-gradient(150deg,#3A4A3F,#232B26)", "linear-gradient(150deg,#8A3A40,#4A1219)"];

// "AAAA-MM-JJ" lu en heure locale (et non minuit UTC, qui décale d'un jour hors métropole).
export function parseJour(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function aujourdhui() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
// Lundi → dimanche de la semaine en cours, en "AAAA-MM-JJ" locaux.
export function joursDeLaSemaine() {
  const lundi = aujourdhui();
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    return isoLocal(d);
  });
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

const libelleSection = {
  fontSize: 11,
  color: T.texteSec,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  margin: 0,
};
export const styleLibelleSection = libelleSection;
export const couleursAccueil = T;

function CarteObjectif({ objectif, onOuvrir }) {
  const jAvant = objectif.date ? ecartJours(objectif.date) : null;
  return (
    <button
      type="button"
      onClick={onOuvrir}
      style={{
        flex: "none",
        width: LARGEUR_OBJECTIF,
        scrollSnapAlign: "start",
        background: "none",
        border: "none",
        borderTop: `1px solid ${T.filet}`,
        textAlign: "left",
        cursor: onOuvrir ? "pointer" : "default",
        font: "inherit",
        color: "inherit",
        padding: "14px 0 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Pas de flex: 1 : le J-x suit le titre au lieu d'être collé au bord droit de la carte,
            où il se confondait avec l'objectif suivant. */}
        <div style={{ flex: "0 1 auto", minWidth: 0 }}>
          <p style={{ ...libelleSection, fontSize: 10, marginBottom: 5 }}>Objectif</p>
          <p
            style={{
              fontFamily: TITRE,
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
          <p style={{ fontFamily: TITRE, fontSize: 24, margin: 0 }}>J-{jAvant}</p>
        ) : null}
      </div>
    </button>
  );
}

function Pastille({ seance, statut }) {
  const couleur = TYPE_COULEUR[seance.type] || T.bordeaux;
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

function Pastilles({ date, seances }) {
  if (seances.length === 0) {
    return <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: T.filet }} />;
  }
  return (
    <span aria-hidden="true" style={{ display: "flex", gap: 3, height: 8 }}>
      {seances.slice(0, 3).map((s) => (
        <Pastille key={s.id} seance={s} statut={statutSeance(date, s)} />
      ))}
    </span>
  );
}

function descriptionJour({ date, seances }) {
  if (seances.length === 0) return `${dateLongue(date)}, repos`;
  const detail = seances
    .map((s) => `${s.titre}${s.is_coached ? ", avec ton coach" : ""}, ${STATUT_LABEL[statutSeance(date, s)]}`)
    .join(" ; ");
  return `${dateLongue(date)}, ${detail}`;
}

function CarteSeance({ date, seance, enAvant, onCommencer, onDecaler, onOuvrir }) {
  const statut = statutSeance(date, seance);
  const jour = enAvant;
  const fond = jour ? T.vert : T.blanc;
  const couleurTexte = jour ? T.clair : T.texte;
  const couleurSec = jour ? T.muted : T.texteSec;
  const fondBloc = jour ? "rgba(245,239,230,0.09)" : T.fond;
  const peutDecaler = !!onDecaler && seance.decalable !== false;

  const meta = seance.is_coached
    ? seance.starts_at
      ? heure(seance.starts_at)
      : "à planifier avec ton coach"
    : seance.meta || (seance.duree_estimee_min ? `≈ ${seance.duree_estimee_min} minutes` : "");

  const boutonLeger = {
    width: "100%",
    marginTop: 16,
    background: "none",
    border: `1px solid ${T.bordure}`,
    borderRadius: 12,
    height: 46,
    fontSize: 13,
    color: T.texte,
    fontFamily: "inherit",
    cursor: "pointer",
  };
  const lienDecaler = (
    <button
      type="button"
      onClick={() => onDecaler(seance)}
      style={{
        width: "100%",
        marginTop: 4,
        background: "none",
        border: "none",
        color: jour ? T.muted : T.texteSec,
        fontSize: 12,
        textDecoration: "underline",
        height: 44,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      Décaler
    </button>
  );

  let action;
  if (seance.is_coached && statut !== "faite") {
    action = (
      <p style={{ fontSize: 12, color: couleurSec, margin: "16px 0 0" }}>Cette séance se fait avec ton coach.</p>
    );
  } else if (statut === "faite") {
    action = (
      <button type="button" onClick={() => onOuvrir(seance)} style={boutonLeger}>
        Revoir la séance
      </button>
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
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Commencer la séance
        </button>
        {peutDecaler ? lienDecaler : null}
      </>
    );
  } else {
    // À venir, ou deuxième séance du jour : on peut toujours l'ouvrir en avance.
    action = (
      <>
        <button type="button" onClick={() => onOuvrir(seance)} style={boutonLeger}>
          Voir la séance
        </button>
        {peutDecaler ? lienDecaler : null}
      </>
    );
  }

  return (
    <div style={{ background: fond, borderRadius: 20, padding: "18px 16px", color: couleurTexte }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: jour ? T.beige : TYPE_COULEUR[seance.type] || T.bordeaux,
          }}
        />
        <span style={{ ...libelleSection, fontSize: 10, color: couleurSec }}>
          {seance.programme || TYPE_LABEL[seance.type]}
          {estAujourdhui(date) ? " · aujourd'hui" : ` · ${dateCourte(date)}`}
        </span>
        {seance.is_coached ? (
          <span style={{ fontSize: 10, color: couleurSec }}>· avec ton coach</span>
        ) : null}
        <span style={{ marginLeft: "auto", fontSize: 11, color: statut === "faite" ? T.vert : couleurSec }}>
          {statut === "faite" ? "✓ Faite" : statut === "manquee" ? "Pas encore faite" : ""}
        </span>
      </div>

      <h2 style={{ fontFamily: TITRE, fontSize: 26, lineHeight: 1.15, margin: "0 0 6px", fontWeight: 600 }}>
        {seance.titre}
      </h2>
      {meta ? <p style={{ fontSize: 12, color: couleurSec, margin: "0 0 16px" }}>{meta}</p> : null}

      {(seance.blocs || []).length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {seance.blocs.map((b, i) => (
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
      ) : null}

      {action}
    </div>
  );
}

function JourSelectionne({ entree, prochaine, onCommencer, onDecaler, onOuvrir }) {
  const { date, seances } = entree;

  if (seances.length === 0) {
    return (
      <div style={{ padding: "4px 4px 0" }}>
        <p style={{ fontSize: 11, color: T.texteSec, margin: "0 0 6px" }}>{dateLongue(date)}</p>
        <p style={{ fontFamily: TITRE, fontSize: 26, lineHeight: 1.15, margin: "0 0 8px" }}>
          {ecartJours(date) < 0 ? "Pas de séance" : "Jour de repos"}
        </p>
        <p style={{ fontSize: 13, color: T.texteCorps, margin: 0 }}>
          {prochaine
            ? `Prochaine séance : ${prochaine.seances[0].titre}, ${dateCourte(prochaine.date)}`
            : "Aucune séance à venir"}
        </p>
      </div>
    );
  }

  // Une seule carte "en avant" (fond vert) : la première séance à faire aujourd'hui.
  const indexEnAvant = seances.findIndex((s) => statutSeance(date, s) === "a_faire");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {seances.map((s, i) => (
        <CarteSeance
          key={s.id}
          date={date}
          seance={s}
          enAvant={i === indexEnAvant}
          onCommencer={onCommencer}
          onDecaler={onDecaler}
          onOuvrir={onOuvrir}
        />
      ))}
    </div>
  );
}

/*
  semaine : 7 entrées { date: "AAAA-MM-JJ", seances: [...] }, lundi → dimanche.
  seance : { id, titre, type, faite, programme?, meta?, duree_estimee_min?, blocs?, decalable?,
             is_coached?, starts_at? }
  objectifs : { id, titre, date|null }
  programmes : { id, titre, sousTitre?, listed_at? }
  Sans onAjouterObjectif, la carte "+ Ajouter un objectif" disparaît (coach en prévisualisation).
  `children` s'affiche sous les programmes (le reste de l'accueil : récurrentes, historique…).
*/
export default function AccueilClient({
  athlete = null,
  objectifs = [],
  programme = null,
  semaine = [],
  programmes = [],
  onCommencerSeance = () => {},
  onDecalerSeance = null,
  onOuvrirSeance = () => {},
  onAjouterObjectif = null,
  onOuvrirObjectifs = null,
  onOuvrirProgramme = () => {},
  children = null,
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
    const toutes = semaine.flatMap((e) => e.seances);
    return { faites: toutes.filter((s) => s.faite).length, prevues: toutes.length };
  }, [semaine]);

  const indexCourant = Math.min(selection, semaine.length - 1);

  const prochaine = useMemo(
    () => semaine.slice(indexCourant + 1).find((e) => e.seances.some((s) => !s.faite)) || null,
    [semaine, indexCourant]
  );

  const nbCartes = objectifsTries.length + (onAjouterObjectif ? 1 : 0);
  // Flèche vers la liste complète (y compris objectifs passés ou atteints, masqués du carrousel).
  const voirTousObjectifs = !!onOuvrirObjectifs && objectifs.length > 0;
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
        color: T.texte,
        paddingTop: 20,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {athlete?.prenom ? (
        <p style={{ fontSize: 12, color: T.texteSec, margin: "0 18px 14px" }}>Bonjour {athlete.prenom}</p>
      ) : null}

      {nbCartes > 0 ? (
        <>
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
              <CarteObjectif key={o.id} objectif={o} onOuvrir={onOuvrirObjectifs || undefined} />
            ))}
            {onAjouterObjectif ? (
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
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                + Ajouter un objectif
              </button>
            ) : null}
          </div>

          {(nbCartes > 1 && railDefilable) || voirTousObjectifs ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 18px 0", minHeight: 44 }}>
              {nbCartes > 1 && railDefilable ? (
                <div style={{ display: "flex", gap: 5 }} aria-hidden="true">
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
              {voirTousObjectifs ? (
                <button
                  type="button"
                  onClick={onOuvrirObjectifs}
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    height: 44,
                    padding: "0 2px",
                    background: "none",
                    border: "none",
                    color: T.bordeaux,
                    fontSize: 12,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  Tous mes objectifs
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>→</span>
                </button>
              ) : null}
            </div>
          ) : null}

          <div style={{ height: 20 }} />
        </>
      ) : null}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 18px", marginBottom: 12 }}>
        <h2 style={{ ...libelleSection, fontWeight: 400 }}>Cette semaine</h2>
        {compteur.prevues > 0 ? (
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
                    fontFamily: "inherit",
                    cursor: "pointer",
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
                      fontWeight: estAujourdhui(e.date) ? 700 : 400,
                    }}
                  >
                    {jourDuMois(e.date)}
                  </span>
                  <Pastilles date={e.date} seances={e.seances} />
                </button>
              );
            })}
          </div>

          <div style={{ padding: "0 14px" }}>
            <JourSelectionne
              entree={semaine[indexCourant]}
              prochaine={prochaine}
              onCommencer={onCommencerSeance}
              onDecaler={onDecalerSeance}
              onOuvrir={onOuvrirSeance}
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
                  fontFamily: "inherit",
                  color: T.texte,
                  cursor: "pointer",
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
                <p style={{ fontFamily: TITRE, fontSize: 14, margin: "9px 2px 2px" }}>{p.titre}</p>
                {p.sousTitre ? (
                  <p style={{ fontSize: 11, color: T.texteSec, margin: "0 2px" }}>{p.sousTitre}</p>
                ) : null}
              </button>
            ))}
          </div>
          <div style={{ height: 30 }} />
        </>
      ) : null}

      {children}
    </div>
  );
}
