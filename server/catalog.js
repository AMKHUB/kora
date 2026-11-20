// Catalogue éditorial Kora — les séries d'exemple ont été retirées :
// l'administrateur (Espace Admin) et les créateurs (Kora Studio) ajoutent librement leurs propres séries.
const T = [
  [1, 'Le Griot de Ségou', 'film', 2024, 'Mali', ['Bambara'], ['Drame', 'Histoire'], '12+', 112, 'Mariam Sidibé', ['Awa Diakité', 'Moussa Keïta', 'Fanta Traoré'], "Dans la Ségou du XIXe siècle, un griot refuse de chanter la gloire d'un roi qu'il sait injuste. Sa voix devient le dernier lien entre deux royaumes au bord de la guerre.", '4K', true, true, 'Original Kora'],
  [3, 'Les Eaux du Bani', 'film', 2023, 'Mali', ['Bambara', 'Français'], ['Drame'], '7+', 98, 'Seydou Coulibaly', ['Moussa Keïta', 'Aminata Sow'], "Quand la crue menace son village, une jeune pêcheuse doit convaincre les anciens de quitter les berges du fleuve.", 'HD', false, true, 'Sélection FESPACO'],
  [4, 'Kènèya', 'doc', 2024, 'Mali', ['Français', 'Bambara'], ['Documentaire'], 'Tous', 72, 'Rokia Camara', ['Aminata Sow'], "Portrait de sages-femmes de Koulikoro qui parcourent la brousse à moto pour accompagner les naissances.", 'HD', false, true, 'Prix du public'],
  [5, 'Sahel Express', 'film', 2025, 'Burkina Faso', ['Français'], ['Action'], '16+', 104, 'Yacouba Ouédraogo', ['Ousmane Ba', 'Mariam Sidibé'], "Un convoi, trois jours de route et un chargement que personne ne doit ouvrir. Course-poursuite entre Ouagadougou et Bamako.", '4K', true, false, 'Nouveauté 2025'],
  [6, 'La Dot', 'film', 2022, 'Sénégal', ['Wolof', 'Français'], ['Comédie', 'Romance'], 'Tous', 95, 'Aminata Sow', ['Ousmane Ba', 'Ndeye Fall'], "Pour épouser la femme qu'il aime, un tailleur de Saint-Louis a une semaine pour réunir une dot qu'il ne possède pas.", 'HD', false, true, ''],
  [8, 'Abidjan Midi', 'film', 2024, 'Côte d’Ivoire', ['Français'], ['Romance', 'Comédie'], '12+', 101, 'Koffi Yao', ['Awa Diakité', 'Koffi Yao'], "Deux inconnus se croisent chaque midi au même maquis d'Abidjan. Une histoire d'amour en dix déjeuners.", 'HD', false, false, ''],
  [9, 'Lagos Under Rain', 'film', 2023, 'Nigeria', ['Anglais'], ['Drame'], '16+', 118, 'Ada Okonkwo', ['Chidi Eze', 'Ada Okonkwo'], "Un chauffeur de bus et une avocate se retrouvent bloqués par les inondations de Lagos, avec une nuit pour se dire la vérité.", '4K', true, false, ''],
  [11, 'Karoo', 'film', 2021, 'Afrique du Sud', ['Anglais'], ['Action'], '16+', 109, 'Thandi Nkosi', ['Thandi Nkosi', 'Sipho Dlamini'], "Une ancienne pilote de rallye traverse le désert du Karoo pour retrouver son frère disparu.", '4K', true, false, ''],
  [12, 'Tombouctou, mémoire de sable', 'doc', 2020, 'Mali', ['Français', 'Arabe'], ['Documentaire', 'Histoire'], 'Tous', 64, 'Salif Maïga', ['Salif Maïga'], "Les gardiens des manuscrits de Tombouctou racontent comment ils ont sauvé des siècles de savoir.", 'HD', false, true, 'Patrimoine'],
  [13, 'Le Fleuve et le Tambour', 'film', 1987, 'Mali', ['Bambara'], ['Drame', 'Histoire'], 'Tous', 92, 'Boubacar Dembélé', ['Mamadou Diarra', 'Kadiatou Sy'], "Un tambourinaire du Niger accompagne trois générations d'un village de pêcheurs. Un classique restauré.", '4K', false, true, 'Classique restauré'],
  [14, 'La Voix du Mandé', 'film', 1994, 'Mali', ['Bambara', 'Français'], ['Musique', 'Drame'], '7+', 88, 'Boubacar Dembélé', ['Kadiatou Sy', 'Mamadou Diarra'], "Une chanteuse de Kita défie la tradition pour porter son répertoire jusqu'à la capitale.", 'HD', false, true, 'Classique restauré'],
  [15, 'Sous le baobab', 'film', 1979, 'Sénégal', ['Wolof'], ['Drame'], 'Tous', 86, 'Mor Thiam', ['Mor Thiam', 'Ndeye Fall'], "Sous l'arbre à palabres, un village juge l'un des siens. Une fable sur la justice et la mémoire.", 'HD', false, false, 'Classique restauré'],
  [16, 'Le Dernier Cola', 'film', 1998, 'Côte d’Ivoire', ['Français'], ['Comédie'], '7+', 90, 'Koffi Yao', ['Koffi Yao', 'Awa Diakité'], "Le dernier vendeur de cola d'Adjamé refuse de céder son étal aux promoteurs.", 'HD', false, false, 'Classique'],
  [17, 'Fana', 'court', 2025, 'Mali', ['Bambara'], ['Animation', 'Jeunesse'], 'Tous', 14, 'Rokia Camara', ['Fanta Traoré'], "Une petite fille et un vieux masque qui parle. Court-métrage d'animation en papier découpé.", '4K', true, true, 'Jeunesse'],
  [18, 'Petit Tailleur', 'court', 2024, 'Burkina Faso', ['Français'], ['Animation', 'Jeunesse'], 'Tous', 11, 'Yacouba Ouédraogo', ['Ousmane Ba'], "Un enfant coud un boubou trop grand pour lui, mais assez grand pour tout un village.", 'HD', false, true, 'Jeunesse'],
  [19, 'Le Pagne', 'court', 2023, 'Diaspora', ['Français', 'Bambara'], ['Drame'], '12+', 19, 'Awa Diakité', ['Awa Diakité', 'Moussa Keïta'], "À Paris, une étudiante hérite du pagne de sa grand-mère et d'un secret de famille.", 'HD', false, false, 'Diaspora'],
  [20, 'Paris-Kayes', 'film', 2024, 'Diaspora', ['Français', 'Bambara'], ['Drame'], '12+', 107, 'Moussa Keïta', ['Moussa Keïta', 'Mariam Sidibé'], "Un chauffeur de taxi parisien rentre à Kayes pour la première fois en vingt ans, avec son fils qui ne parle pas bambara.", '4K', true, true, 'Coup de cœur'],
  [22, 'Le Berger de Hamdallaye', 'film', 2022, 'Mali', ['Peul'], ['Drame'], '12+', 99, 'Ibrahim Konaté', ['Ousmane Ba', 'Aminata Sow'], "Un berger peul suit ses troupeaux sur trois cents kilomètres de transhumance, entre sécheresse et frontières.", '4K', true, false, 'Sélection officielle']
]

const items = T.map(([id, title, type, year, country, langs, genres, age, dur, director, cast, synopsis, quality, hdr, audioDesc, badge]) => ({
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
  badge: badge || undefined
}))

const ids = f => items.filter(f).map(i => i.id)

export const catalog = {
  items,
  hero: 1,
  heroes: [1, 20, 5, 13],
  rows: {
    top10: [1, 5, 20, 6, 3, 17, 8, 12, 22, 4],
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
