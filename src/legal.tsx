import { ReactNode } from 'react'

const Doc = ({ title, children }: { title: string; children: ReactNode }) => (
  <article className="page legal">
    <a className="lnk" href="#/">← Retour à l’accueil</a>
    <h1>{title}</h1>
    <p className="mu">Dernière mise à jour : 20 novembre 2026 · Kora Streaming, Bamako, Mali.</p>
    {children}
  </article>
)

export const Privacy = () => (
  <Doc title="Politique de confidentialité">
    <h2>1. Responsable du traitement</h2>
    <p>Kora, service de streaming dédié au cinéma malien, africain et de la diaspora, basé à Bamako (Mali), est responsable du traitement de vos données personnelles. Pour toute question : contact@kora.cinema.</p>
    <h2>2. Données collectées</h2>
    <p>Données de compte (e-mail ou numéro de téléphone, nom, pays de résidence), profils du foyer (nom, avatar, préférence enfant, code PIN chiffré), liste de favoris, historique et position de lecture, évaluations, appareils connectés, et informations de facturation traitées par nos partenaires de paiement (Orange Money, Moov Money, Wave, carte bancaire).</p>
    <h2>3. Finalités</h2>
    <p>Fournir l’accès au catalogue et la reprise multi-écrans, personnaliser les recommandations, gérer les abonnements et factures, assurer la sécurité du service (limitation d’écrans, lutte contre la fraude), afficher des publicités dans la formule gratuite et respecter les droits territoriaux des ayants droit.</p>
    <h2>4. Mesure d’audience et cookies</h2>
    <p>La mesure d’audience de Kora fonctionne sans cookie publicitaire et sans identifiant persistant. Les cookies de personnalisation publicitaire de la formule gratuite ne sont activés qu’avec votre consentement explicite, modifiable à tout moment depuis votre espace Profil.</p>
    <h2>5. Protection des profils enfants</h2>
    <p>Un profil enfant filtre automatiquement le catalogue aux œuvres « Tous publics » et « 7+ », désactive les publicités personnalisées et peut être séparé des profils adultes par un code PIN à 4 chiffres.</p>
    <h2>6. Conservation & sécurité</h2>
    <p>Tous les échanges sont chiffrés en HTTPS/TLS (HSTS). Les flux vidéo privés sont servis par liens signés temporaires. Vos données sont hébergées sur une infrastructure PostgreSQL sécurisée avec isolation par ligne (RLS) et supprimées ou anonymisées à la clôture de votre compte.</p>
    <h2>7. Vos droits</h2>
    <p>Conformément aux réglementations applicables et aux recommandations de l’Autorité de protection des données à caractère personnel du Mali (APDP), vous disposez d’un droit d’accès, de rectification, de suppression, d’opposition et de portabilité de vos données.</p>
  </Doc>
)

export const Terms = () => (
  <Doc title="Conditions générales d’utilisation">
    <h2>1. Objet</h2>
    <p>Les présentes conditions générales encadrent l’accès et l’utilisation de Kora, plateforme de vidéo à la demande dédiée aux films, séries, documentaires et courts-métrages maliens, africains et de la diaspora.</p>
    <h2>2. Formules d’accès</h2>
    <p>Kora propose une formule Gratuite financée par la publicité, ainsi que des abonnements mensuels ou annuels sans engagement (Premium et Famille &amp; Cinéma) offrant une lecture sans publicité, une qualité jusqu’à 4K HDR et plusieurs écrans simultanés.</p>
    <h2>3. Compte, foyer et sécurité</h2>
    <p>Vous êtes responsable de la confidentialité de vos identifiants et de l’usage des profils rattachés à votre foyer. Les mineurs utilisent Kora sous la responsabilité de leurs représentants légaux.</p>
    <h2>4. Abonnements et résiliation</h2>
    <p>Les abonnements payants sont sans engagement et renouvelés tacitement. Vous pouvez changer de formule ou résilier à tout moment depuis la page Abonnement ; la résiliation prend effet à l’échéance de la période en cours.</p>
    <h2>5. Propriété intellectuelle et droits territoriaux</h2>
    <p>L’ensemble des œuvres, affiches, bandes-annonces, marques et éléments graphiques de Kora sont protégés par le droit d’auteur et les contrats signés avec les ayants droit. La disponibilité de certains titres peut varier selon votre pays de résidence. Toute copie, capture ou rediffusion publique est strictement interdite.</p>
    <h2>6. Usages interdits</h2>
    <p>Il est interdit de contourner les mesures techniques de protection, de partager ses identifiants en dehors du foyer ou de perturber le fonctionnement de la plateforme.</p>
    <h2>7. Droit applicable</h2>
    <p>Les présentes conditions sont soumises au droit malien. En cas de litige, les parties privilégient une résolution amiable avant toute saisine des juridictions compétentes de Bamako.</p>
  </Doc>
)
