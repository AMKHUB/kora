// Catalogue éditorial Kora — cinéma malien, africain et de la diaspora.
const SERIES_EPISODES = {
  2: {
    1: [
      { number: 1, title: 'Fréquence 98.4', duration_min: 46, intro_end_sec: 75, synopsis: 'À minuit sur les bords du Niger, une voix anonyme fait trembler les notables de Badalabougou.' },
      { number: 2, title: 'Les Enfants de la rive', duration_min: 44, intro_end_sec: 75, synopsis: 'Mariam retrouve son frère au studio pendant qu’une promesse ancienne refait surface.' },
      { number: 3, title: 'La Pluie sur Sotuba', duration_min: 48, intro_end_sec: 80, synopsis: 'L’hivernage coupe le courant dans le quartier et force deux familles rivales à s’abriter ensemble.' },
      { number: 4, title: 'Le Silence du griot', duration_min: 45, intro_end_sec: 75, synopsis: 'Une cassette oubliée révèle la véritable origine de la radio de nuit.' },
      { number: 5, title: 'Nuit blanche à Hippodrome', duration_min: 47, intro_end_sec: 75, synopsis: 'Le concert clandestin tourne au face-à-face entre deux générations.' },
      { number: 6, title: 'L’Aube sur Bamako', duration_min: 52, intro_end_sec: 80, synopsis: 'L’émission spéciale lève le voile sur tous les secrets du quartier.' }
    ],
    2: [
      { number: 1, title: 'Retour d’hivernage', duration_min: 45, intro_end_sec: 75, synopsis: 'Six mois plus tard, la station rouvre ses micros avec une nouvelle équipe.' },
      { number: 2, title: 'Les Lettres de Kayes', duration_min: 43, intro_end_sec: 75, synopsis: 'Un auditeur envoie des carnets qui bouleversent la famille Konaté.' },
      { number: 3, title: 'Accord mineur', duration_min: 46, intro_end_sec: 75, synopsis: 'Un guitariste venu de Ségou bouscule l’équilibre du studio.' },
      { number: 4, title: 'Minuit pile', duration_min: 44, intro_end_sec: 75, synopsis: 'Une coupure d’antenne inexpliquée déclenche une enquête dans toute la ville.' },
      { number: 5, title: 'Le Pont des Martyrs', duration_min: 48, intro_end_sec: 80, synopsis: 'Chacun doit choisir entre loyauté familiale et vérité.' },
      { number: 6, title: 'Dernière chanson', duration_min: 54, intro_end_sec: 85, synopsis: 'Un final lumineux porté par toute la scène musicale bamakoise.' }
    ]
  },
  7: {
    1: [
      { number: 1, title: 'Face A · Médina', duration_min: 41, intro_end_sec: 65, synopsis: 'Quatre amis récupèrent une vieille console quatre pistes dans un garage de Dakar.' },
      { number: 2, title: 'Le Sample de Gorée', duration_min: 39, intro_end_sec: 65, synopsis: 'Ils enregistrent un vieux joueur de kora pour poser les bases de leur premier titre.' },
      { number: 3, title: 'Nuit au marché Sandaga', duration_min: 42, intro_end_sec: 65, synopsis: 'Il faut réunir de quoi presser cinq cents cassettes avant vendredi.' },
      { number: 4, title: 'Rivalité sur la Corniche', duration_min: 40, intro_end_sec: 65, synopsis: 'Un producteur propose un contrat solo à la voix principale du groupe.' },
      { number: 5, title: 'Micro ouvert', duration_min: 43, intro_end_sec: 65, synopsis: 'Le quartier entier se rassemble pour la battle d’été.' },
      { number: 6, title: 'Face B · L’Envol', duration_min: 46, intro_end_sec: 70, synopsis: 'La mixtape circule enfin de Dakar jusqu’à Bamako et Paris.' }
    ]
  },
  10: {
    1: [
      { number: 1, title: 'Le Toit qui fuit', duration_min: 26, intro_end_sec: 40, synopsis: 'Premier jour de saison des pluies : la terrasse devient une piscine olympique.' },
      { number: 2, title: 'Loyer en retard', duration_min: 24, intro_end_sec: 40, synopsis: 'Les cinq colocataires improvisent un dîner gastronomique pour amadouer le propriétaire.' },
      { number: 3, title: 'Coupure de Wi-Fi', duration_min: 25, intro_end_sec: 40, synopsis: 'Privés d’Internet pendant 24 heures, ils redécouvrent la conversation.' },
      { number: 4, title: 'Le Cousin de Kumasi', duration_min: 27, intro_end_sec: 40, synopsis: 'Une visite surprise de trois jours menace de durer trois mois.' },
      { number: 5, title: 'Mariage au rez-de-chaussée', duration_min: 25, intro_end_sec: 40, synopsis: 'La sono du mariage voisin transforme le salon en piste de danse.' },
      { number: 6, title: 'La Grande Réunion', duration_min: 28, intro_end_sec: 40, synopsis: 'Le propriétaire annonce une nouvelle inattendue sur l’immeuble.' }
    ],
    2: [
      { number: 1, title: 'Nouveau voisin', duration_min: 25, intro_end_sec: 40, synopsis: 'Un chef cuisinier emménage sur le palier et bouleverse les habitudes.' },
      { number: 2, title: 'La Panne d’ascenseur', duration_min: 24, intro_end_sec: 40, synopsis: 'Six étages à pied avec un réfrigérateur.' },
      { number: 3, title: 'Casting à Osu', duration_min: 26, intro_end_sec: 40, synopsis: 'Toute la colocation passe une audition pour une publicité.' },
      { number: 4, title: 'Le Match de l’année', duration_min: 25, intro_end_sec: 40, synopsis: 'Une seule télévision, deux équipes supportées et vingt invités.' },
      { number: 5, title: 'Panne de générateur', duration_min: 26, intro_end_sec: 40, synopsis: 'Soirée à la bougie et révélations en chaîne.' },
      { number: 6, title: 'Sous les étoiles d’Accra', duration_min: 29, intro_end_sec: 40, synopsis: 'Fête improvisée sur le toit fraîchement réparé.' }
    ],
    3: [
      { number: 1, title: 'Les Grands Projets', duration_min: 25, intro_end_sec: 40, synopsis: 'Chacun lance son entreprise depuis la table du salon.' },
      { number: 2, title: 'Le Chat du quartier', duration_min: 24, intro_end_sec: 40, synopsis: 'Un invité à quatre pattes sème la zizanie.' },
      { number: 3, title: 'Week-end à Cape Coast', duration_min: 27, intro_end_sec: 40, synopsis: 'Une escapade en bord de mer qui ne suit aucun plan.' },
      { number: 4, title: 'La Visite de Maman', duration_min: 26, intro_end_sec: 40, synopsis: 'Grand ménage éclair avant l’arrivée de la mère d’Esi.' },
      { number: 5, title: 'L’Exposition photo', duration_min: 25, intro_end_sec: 40, synopsis: 'Le toit devient une galerie le temps d’un soir.' },
      { number: 6, title: 'Clés en main', duration_min: 29, intro_end_sec: 40, synopsis: 'Une nouvelle page s’ouvre pour les cinq amis.' }
    ]
  },
  21: {
    1: [
      { number: 1, title: 'Le Cahier volant', duration_min: 22, intro_end_sec: 35, synopsis: 'La classe invente l’histoire d’un cahier qui voyage jusqu’au fleuve Niger.' },
      { number: 2, title: 'L’Arbre aux lettres', duration_min: 21, intro_end_sec: 35, synopsis: 'Chaque feuille du baobab cache un nouveau mot en bambara et en français.' },
      { number: 3, title: 'La Course des tortues', duration_min: 22, intro_end_sec: 35, synopsis: 'Une fable drôle sur la patience et l’entraide.' },
      { number: 4, title: 'Le Tambour des nuages', duration_min: 23, intro_end_sec: 35, synopsis: 'Comment les élèves imaginent la naissance de la pluie.' },
      { number: 5, title: 'Le Marché des couleurs', duration_min: 22, intro_end_sec: 35, synopsis: 'Un voyage au pays de l’indigo et du bogolan.' },
      { number: 6, title: 'La Fête du village', duration_min: 24, intro_end_sec: 35, synopsis: 'Les enfants racontent leurs propres contes devant tout le village.' }
    ],
    2: [
      { number: 1, title: 'La Nouvelle Élève', duration_min: 22, intro_end_sec: 35, synopsis: 'Amina arrive de Mopti avec de nouvelles légendes du fleuve.' },
      { number: 2, title: 'L’Horloge du soleil', duration_min: 21, intro_end_sec: 35, synopsis: 'Apprendre à lire l’heure grâce aux ombres de la cour.' },
      { number: 3, title: 'Le Petit Griot', duration_min: 22, intro_end_sec: 35, synopsis: 'Un conte musical autour des vingt-et-une cordes de la kora.' },
      { number: 4, title: 'La Bibliothèque à vélo', duration_min: 23, intro_end_sec: 35, synopsis: 'Une mystérieuse cycliste apporte des livres illustrés.' },
      { number: 5, title: 'Les Étoiles du Sahel', duration_min: 22, intro_end_sec: 35, synopsis: 'Observation du ciel nocturne avec le maître d’école.' },
      { number: 6, title: 'Le Grand Livre de Kalan', duration_min: 24, intro_end_sec: 35, synopsis: 'La classe relie toutes ses histoires en un seul recueil.' }
    ]
  }
}

const T = [
  [1, 'Le Griot de Ségou', 'film', 2024, 'Mali', ['Bambara'], ['Drame', 'Histoire'], '12+', 112, 'Mariam Sidibé', ['Awa Diakité', 'Moussa Keïta', 'Fanta Traoré'], "Dans la Ségou du XIXe siècle, un griot refuse de chanter la gloire d'un roi qu'il sait injuste. Sa voix devient le dernier lien entre deux royaumes au bord de la guerre.", null, '4K', true, true, 'Original Kora'],
  [2, 'Nuits de Bamako', 'serie', 2025, 'Mali', ['Bambara', 'Français'], ['Drame', 'Romance'], '12+', 45, 'Ibrahim Konaté', ['Fanta Traoré', 'Seydou Coulibaly', 'Rokia Camara'], "Trois familles, un quartier de Bamako et une radio de nuit qui connaît tous les secrets. Une saga amoureuse portée par la musique.", 2, '4K', true, true, 'Série originale'],
  [3, 'Les Eaux du Bani', 'film', 2023, 'Mali', ['Bambara', 'Français'], ['Drame'], '7+', 98, 'Seydou Coulibaly', ['Moussa Keïta', 'Aminata Sow'], "Quand la crue menace son village, une jeune pêcheuse doit convaincre les anciens de quitter les berges du fleuve.", null, 'HD', false, true, 'Sélection FESPACO'],
  [4, 'Kènèya', 'doc', 2024, 'Mali', ['Français', 'Bambara'], ['Documentaire'], 'Tous', 72, 'Rokia Camara', ['Aminata Sow'], "Portrait de sages-femmes de Koulikoro qui parcourent la brousse à moto pour accompagner les naissances.", null, 'HD', false, true, 'Prix du public'],
  [5, 'Sahel Express', 'film', 2025, 'Burkina Faso', ['Français'], ['Action'], '16+', 104, 'Yacouba Ouédraogo', ['Ousmane Ba', 'Mariam Sidibé'], "Un convoi, trois jours de route et un chargement que personne ne doit ouvrir. Course-poursuite entre Ouagadougou et Bamako.", null, '4K', true, false, 'Nouveauté 2025'],
  [6, 'La Dot', 'film', 2022, 'Sénégal', ['Wolof', 'Français'], ['Comédie', 'Romance'], 'Tous', 95, 'Aminata Sow', ['Ousmane Ba', 'Ndeye Fall'], "Pour épouser la femme qu'il aime, un tailleur de Saint-Louis a une semaine pour réunir une dot qu'il ne possède pas.", null, 'HD', false, true, ''],
  [7, 'Dakar Mixtape', 'serie', 2025, 'Sénégal', ['Wolof', 'Français'], ['Musique', 'Drame'], '12+', 40, 'Ndeye Fall', ['Ousmane Ba', 'Rokia Camara'], "Un studio de fortune à la Médina, quatre rappeurs et une cassette qui pourrait tout changer.", 1, '4K', true, false, 'Exclusivité'],
  [8, 'Abidjan Midi', 'film', 2024, 'Côte d’Ivoire', ['Français'], ['Romance', 'Comédie'], '12+', 101, 'Koffi Yao', ['Awa Diakité', 'Koffi Yao'], "Deux inconnus se croisent chaque midi au même maquis d'Abidjan. Une histoire d'amour en dix déjeuners.", null, 'HD', false, false, ''],
  [9, 'Lagos Under Rain', 'film', 2023, 'Nigeria', ['Anglais'], ['Drame'], '16+', 118, 'Ada Okonkwo', ['Chidi Eze', 'Ada Okonkwo'], "Un chauffeur de bus et une avocate se retrouvent bloqués par les inondations de Lagos, avec une nuit pour se dire la vérité.", null, '4K', true, false, ''],
  [10, 'Accra Rooftop', 'serie', 2024, 'Ghana', ['Anglais'], ['Comédie'], '7+', 25, 'Kofi Mensah', ['Kofi Mensah', 'Esi Boateng'], "Cinq colocataires, un toit d'Accra et un propriétaire toujours en retard sur les travaux.", 3, 'HD', false, false, ''],
  [11, 'Karoo', 'film', 2021, 'Afrique du Sud', ['Anglais'], ['Action'], '16+', 109, 'Thandi Nkosi', ['Thandi Nkosi', 'Sipho Dlamini'], "Une ancienne pilote de rallye traverse le désert du Karoo pour retrouver son frère disparu.", null, '4K', true, false, ''],
  [12, 'Tombouctou, mémoire de sable', 'doc', 2020, 'Mali', ['Français', 'Arabe'], ['Documentaire', 'Histoire'], 'Tous', 64, 'Salif Maïga', ['Salif Maïga'], "Les gardiens des manuscrits de Tombouctou racontent comment ils ont sauvé des siècles de savoir.", null, 'HD', false, true, 'Patrimoine'],
  [13, 'Le Fleuve et le Tambour', 'film', 1987, 'Mali', ['Bambara'], ['Drame', 'Histoire'], 'Tous', 92, 'Boubacar Dembélé', ['Mamadou Diarra', 'Kadiatou Sy'], "Un tambourinaire du Niger accompagne trois générations d'un village de pêcheurs. Un classique restauré.", null, '4K', false, true, 'Classique restauré'],
  [14, 'La Voix du Mandé', 'film', 1994, 'Mali', ['Bambara', 'Français'], ['Musique', 'Drame'], '7+', 88, 'Boubacar Dembélé', ['Kadiatou Sy', 'Mamadou Diarra'], "Une chanteuse de Kita défie la tradition pour porter son répertoire jusqu'à la capitale.", null, 'HD', false, true, 'Classique restauré'],
  [15, 'Sous le baobab', 'film', 1979, 'Sénégal', ['Wolof'], ['Drame'], 'Tous', 86, 'Mor Thiam', ['Mor Thiam', 'Ndeye Fall'], "Sous l'arbre à palabres, un village juge l'un des siens. Une fable sur la justice et la mémoire.", null, 'HD', false, false, 'Classique restauré'],
  [16, 'Le Dernier Cola', 'film', 1998, 'Côte d’Ivoire', ['Français'], ['Comédie'], '7+', 90, 'Koffi Yao', ['Koffi Yao', 'Awa Diakité'], "Le dernier vendeur de cola d'Adjamé refuse de céder son étal aux promoteurs.", null, 'HD', false, false, 'Classique'],
  [17, 'Fana', 'court', 2025, 'Mali', ['Bambara'], ['Animation', 'Jeunesse'], 'Tous', 14, 'Rokia Camara', ['Fanta Traoré'], "Une petite fille et un vieux masque qui parle. Court-métrage d'animation en papier découpé.", null, '4K', true, true, 'Jeunesse'],
  [18, 'Petit Tailleur', 'court', 2024, 'Burkina Faso', ['Français'], ['Animation', 'Jeunesse'], 'Tous', 11, 'Yacouba Ouédraogo', ['Ousmane Ba'], "Un enfant coud un boubou trop grand pour lui, mais assez grand pour tout un village.", null, 'HD', false, true, 'Jeunesse'],
  [19, 'Le Pagne', 'court', 2023, 'Diaspora', ['Français', 'Bambara'], ['Drame'], '12+', 19, 'Awa Diakité', ['Awa Diakité', 'Moussa Keïta'], "À Paris, une étudiante hérite du pagne de sa grand-mère et d'un secret de famille.", null, 'HD', false, false, 'Diaspora'],
  [20, 'Paris-Kayes', 'film', 2024, 'Diaspora', ['Français', 'Bambara'], ['Drame'], '12+', 107, 'Moussa Keïta', ['Moussa Keïta', 'Mariam Sidibé'], "Un chauffeur de taxi parisien rentre à Kayes pour la première fois en vingt ans, avec son fils qui ne parle pas bambara.", null, '4K', true, true, 'Coup de cœur'],
  [21, 'Kalan', 'serie', 2025, 'Mali', ['Bambara', 'Français'], ['Animation', 'Jeunesse'], 'Tous', 22, 'Fanta Traoré', ['Fanta Traoré', 'Seydou Coulibaly'], "Dans une école de brousse, une classe apprend à lire en inventant ses propres histoires.", 2, 'HD', false, true, 'Jeunesse'],
  [22, 'Le Berger de Hamdallaye', 'film', 2022, 'Mali', ['Peul'], ['Drame'], '12+', 99, 'Ibrahim Konaté', ['Ousmane Ba', 'Aminata Sow'], "Un berger peul suit ses troupeaux sur trois cents kilomètres de transhumance, entre sécheresse et frontières.", null, '4K', true, false, 'Sélection officielle']
]

const items = T.map(([id, title, type, year, country, langs, genres, age, dur, director, cast, synopsis, seasons, quality, hdr, audioDesc, badge]) => ({
  id,
  title,
  type,
  year,
  country,
  langs,
  subtitles: ['Français', 'English', ...(langs.includes('Bambara') ? ['Bambara'] : [])],
  genres,
  age,
  dur,
  director,
  cast,
  synopsis,
  quality,
  hdr,
  audioDesc,
  badge: badge || undefined,
  ...(seasons ? { seasons, episodesBySeason: SERIES_EPISODES[id] || {} } : {})
}))

const ids = f => items.filter(f).map(i => i.id)

export const catalog = {
  items,
  hero: 1,
  heroes: [1, 2, 20, 5, 13],
  rows: {
    top10: [1, 2, 5, 20, 6, 3, 7, 17, 12, 21],
    trending: ids(i => i.country === 'Mali' && i.year >= 2022),
    new: ids(i => i.year >= 2025),
    malifilms: ids(i => i.country === 'Mali' && i.type === 'film'),
    series: ids(i => i.type === 'serie'),
    africa: ids(i => i.country !== 'Mali'),
    docs: ids(i => i.type === 'doc'),
    shorts: ids(i => i.type === 'court'),
    discover: ids(i => i.country !== 'Mali' && i.type === 'film' && i.year >= 2020),
    classics: ids(i => i.year < 2000),
    pick: [3, 12, 20, 19, 22, 6, 17]
  }
}
