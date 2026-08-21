import { routes, type ProtectedRoute } from "@/lib/routes";

export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: readonly string[] }
  | { type: "subheading"; text: string };

export type BlogArticle = {
  title: string;
  href: ProtectedRoute;
  category: "Général" | "Gros œuvre";
  categoryHref: ProtectedRoute;
  published: string;
  publishedIso: string;
  image: string;
  imageAlt: string;
  introduction: readonly string[];
  sections: readonly {
    title: string;
    blocks: readonly ArticleBlock[];
  }[];
};

export const blogArticles: readonly BlogArticle[] = [
  {
    title: "Les nouvelles tendances dans la construction en 2025",
    href: routes.constructionTrends2025,
    category: "Général",
    categoryHref: routes.categoryGeneral,
    published: "7 mai 2025",
    publishedIso: "2025-05-07",
    image: "/images/portfolio-2026/projects/immeuble-r5-al-farah-etat-final.webp",
    imageAlt: "Immeuble R+5 achevé à Agadir",
    introduction: [
      "L’année 2025 marque un tournant majeur dans le domaine de la construction. Les attentes des clients évoluent, les enjeux environnementaux deviennent prioritaires, et les innovations technologiques transforment les méthodes de travail. À Agadir comme ailleurs, les professionnels du secteur, dont S2MBOU, s’adaptent à ces changements pour proposer des solutions modernes, durables et intelligentes.",
      "Voici un tour d’horizon des tendances incontournables de la construction en 2025.",
    ],
    sections: [
      {
        title: "1. La construction écoresponsable devient la norme",
        blocks: [
          { type: "paragraph", text: "Face aux défis du changement climatique, la demande pour des bâtiments respectueux de l’environnement est en forte croissance. En 2025, la construction durable n’est plus une option, mais une exigence." },
          { type: "subheading", text: "Ce qui change :" },
          { type: "list", items: ["Utilisation de matériaux biosourcés (bois, chanvre, liège, terre crue)", "Intégration systématique d’isolants naturels pour améliorer la performance énergétique", "Réduction de l’empreinte carbone des chantiers", "Optimisation de la consommation d’eau et d’énergie"] },
          { type: "paragraph", text: "Chez S2MBOU, la construction durable est au cœur de chaque projet, en particulier dans la région d’Agadir, où l’ensoleillement permet d’intégrer facilement des solutions solaires." },
        ],
      },
      {
        title: "2. Les maisons intelligentes (Smart Homes)",
        blocks: [
          { type: "paragraph", text: "La domotique s’impose comme un standard dans les constructions neuves. En 2025, les bâtiments sont connectés, plus sûrs, plus confortables et économes en énergie." },
          { type: "subheading", text: "Éléments intégrés :" },
          { type: "list", items: ["Contrôle à distance de l’éclairage, du chauffage et des volets", "Systèmes de sécurité intelligents", "Gestion automatique de la consommation d’énergie", "Appareils électroménagers connectés"] },
          { type: "paragraph", text: "S2MBOU intègre ces solutions sur-mesure dans ses projets, afin d’offrir à ses clients à Agadir une expérience de vie moderne et évolutive." },
        ],
      },
      {
        title: "3. L’architecture bioclimatique",
        blocks: [
          { type: "paragraph", text: "En 2025, la conception des bâtiments s’oriente vers l’architecture bioclimatique, une méthode qui consiste à tirer parti de l’environnement naturel pour optimiser le confort intérieur tout en réduisant les besoins énergétiques." },
          { type: "subheading", text: "Principes appliqués :" },
          { type: "list", items: ["Orientation stratégique du bâtiment", "Maximisation de la lumière naturelle", "Utilisation de la ventilation naturelle", "Protection contre la chaleur en été"] },
          { type: "paragraph", text: "À Agadir, ce type de conception est particulièrement adapté au climat. S2MBOU mise sur des conceptions intelligentes qui allient esthétique et performance énergétique." },
        ],
      },
      {
        title: "4. La montée du modulaire et du préfabriqué",
        blocks: [
          { type: "paragraph", text: "Pour gagner en rapidité, en précision et en maîtrise des coûts, la construction modulaire et préfabriquée connaît un essor important en 2025." },
          { type: "subheading", text: "Avantages :" },
          { type: "list", items: ["Réduction des délais de chantier", "Moins de nuisances sur site", "Meilleure gestion des matériaux", "Haute qualité de fabrication en atelier"] },
          { type: "paragraph", text: "Cette méthode innovante permet à S2MBOU de proposer des solutions efficaces pour les logements, les bureaux ou les bâtiments professionnels à Agadir." },
        ],
      },
      {
        title: "5. Le design minimaliste et fonctionnel",
        blocks: [
          { type: "paragraph", text: "En 2025, le style architectural est marqué par la simplicité, la fluidité des espaces et la fonctionnalité. Le minimalisme est en vogue, avec des intérieurs épurés, lumineux et bien pensés." },
          { type: "subheading", text: "Caractéristiques :" },
          { type: "list", items: ["Matériaux bruts et naturels", "Couleurs douces et neutres", "Espaces ouverts et modulables", "Mobilier intégré et sur-mesure"] },
          { type: "paragraph", text: "S2MBOU, spécialisée aussi dans l’aménagement intérieur, accompagne ses clients à Agadir dans la réalisation de maisons esthétiques et fonctionnelles, où chaque mètre carré est optimisé." },
        ],
      },
      {
        title: "6. Le retour du local et du savoir-faire artisanal",
        blocks: [
          { type: "paragraph", text: "En réaction à la mondialisation, on assiste en 2025 à un retour aux matériaux locaux et au travail artisanal de qualité. Les clients recherchent de plus en plus l’authenticité, le fait-main et les produits du terroir." },
          { type: "paragraph", text: "S2MBOU valorise les matériaux marocains et les artisans d’Agadir pour créer des constructions à la fois modernes et enracinées dans leur environnement." },
        ],
      },
      {
        title: "Conclusion",
        blocks: [
          { type: "paragraph", text: "En 2025, la construction entre dans une nouvelle ère : plus durable, plus connectée, plus rapide, mais aussi plus humaine. À Agadir, la société S2MBOU s’engage à suivre ces évolutions pour offrir à ses clients des projets sur-mesure, innovants et responsables." },
          { type: "paragraph", text: "Vous souhaitez construire ou rénover un bien à Agadir ? Faites confiance à S2MBOU pour concrétiser votre vision avec les tendances les plus actuelles du secteur." },
        ],
      },
    ],
  },
  {
    title: "Comment bien préparer son budget de construction ?",
    href: routes.constructionBudget,
    category: "Général",
    categoryHref: routes.categoryGeneral,
    published: "7 mai 2025",
    publishedIso: "2025-05-07",
    image: "/images/portfolio-2026/projects/al-huda-01.webp",
    imageAlt: "Chantier d’un immeuble R+5 à Agadir",
    introduction: [
      "Construire une maison est un projet de vie passionnant, mais qui nécessite une planification rigoureuse, en particulier sur le plan financier. Une bonne préparation du budget de construction permet d’éviter les mauvaises surprises, de faire les bons choix dès le départ et d’assurer la réussite du projet dans les délais.",
      "Voici un guide complet pour vous aider à bien préparer votre budget de construction, étape par étape.",
    ],
    sections: [
      { title: "1. Définir votre enveloppe financière", blocks: [
        { type: "paragraph", text: "La première étape consiste à évaluer votre capacité de financement. Cela inclut :" },
        { type: "list", items: ["Vos économies personnelles", "Un éventuel crédit immobilier (montant et taux d’intérêt)", "Les aides possibles (si disponibles localement)"] },
        { type: "paragraph", text: "Il est important d’avoir une marge de sécurité d’au moins 10 à 15 % pour anticiper les imprévus ou les ajustements en cours de chantier." },
      ] },
      { title: "2. Évaluer le coût du terrain", blocks: [
        { type: "paragraph", text: "L’achat du terrain est une dépense majeure, et son prix peut varier selon :" },
        { type: "list", items: ["La localisation (centre-ville, périphérie, rural)", "La superficie", "L’accès aux voiries, à l’électricité, à l’eau et au tout-à-l’égout"] },
        { type: "paragraph", text: "Pensez également aux frais de notaire, aux droits d’enregistrement et aux éventuels travaux de viabilisation. À Agadir, par exemple, certains quartiers nécessitent des travaux spécifiques que l’entreprise S2MBOU peut vous aider à estimer." },
      ] },
      { title: "3. Déterminer le coût de la construction", blocks: [
        { type: "paragraph", text: "Le coût de construction dépend de plusieurs éléments :" },
        { type: "list", items: ["Le type de construction : traditionnelle, moderne, en béton, en briques, etc.", "Le niveau de finition souhaité (standard, moyen, haut de gamme)", "La surface habitable", "La complexité architecturale"] },
        { type: "paragraph", text: "En 2025, au Maroc, le prix moyen au m² peut varier entre 3 500 et 6 500 MAD, selon la région et les matériaux choisis. Il est recommandé de demander un devis détaillé à un professionnel, comme S2MBOU, pour éviter les erreurs d’estimation." },
      ] },
      { title: "4. Inclure les frais annexes", blocks: [
        { type: "paragraph", text: "Il ne faut pas se limiter au gros œuvre. Un budget bien préparé doit inclure :" },
        { type: "list", items: ["Les études techniques (plans, géotechnique, topographie)", "Le permis de construire et les taxes locales", "Les frais d’architecte ou de maître d’œuvre", "Les assurances", "Le raccordement aux réseaux (eau, électricité, internet, assainissement)"] },
        { type: "paragraph", text: "Ces postes peuvent représenter 10 à 20 % du budget total." },
      ] },
      { title: "5. Prendre en compte l’aménagement intérieur et extérieur", blocks: [
        { type: "paragraph", text: "Trop souvent négligés, les travaux d’aménagement doivent être intégrés dès le départ :" },
        { type: "list", items: ["Cuisine, salle de bain, rangements, revêtements, peinture, éclairage", "Jardin, clôture, terrasse, portail, garage", "Équipements supplémentaires (chauffe-eau solaire, climatisation, domotique…)"] },
        { type: "paragraph", text: "S2MBOU, spécialiste de l’aménagement à Agadir, peut vous accompagner pour estimer ces postes avec précision." },
      ] },
      { title: "6. Prévoir une marge pour les imprévus", blocks: [
        { type: "paragraph", text: "Aucun chantier ne se déroule à 100 % comme prévu. Il est indispensable de prévoir une réserve budgétaire, généralement de 10 à 15 % du montant global, pour faire face à :" },
        { type: "list", items: ["Des modifications de dernière minute", "Des hausses de prix des matériaux", "Des retards dus à la météo ou à la livraison"] },
      ] },
      { title: "7. Comparer les devis et choisir les bons partenaires", blocks: [
        { type: "paragraph", text: "Demandez plusieurs devis détaillés à des entreprises sérieuses. Méfiez-vous des offres trop basses, souvent synonymes de qualité médiocre ou de coûts cachés." },
        { type: "paragraph", text: "Optez pour une société comme S2MBOU, qui vous propose :" },
        { type: "list", items: ["Un accompagnement personnalisé", "Des matériaux de qualité", "Une transparence sur les coûts", "Des solutions optimisées pour la région d’Agadir"] },
      ] },
      { title: "Conclusion", blocks: [
        { type: "paragraph", text: "Préparer son budget de construction, c’est bien plus que chiffrer des murs et un toit. C’est anticiper, planifier et sécuriser l’ensemble du projet, du terrain aux finitions, en passant par les imprévus." },
        { type: "paragraph", text: "En travaillant avec une entreprise fiable comme S2MBOU, vous avez la garantie d’un budget maîtrisé, de conseils d’experts et d’un projet mené en toute confiance, dans les meilleures conditions." },
      ] },
    ],
  },
  {
    title: "Comment choisir les bons matériaux pour votre maison ?",
    href: routes.constructionMaterials,
    category: "Gros œuvre",
    categoryHref: routes.categoryStructuralWork,
    published: "7 mai 2025",
    publishedIso: "2025-05-07",
    image: "/images/about-project.jpg",
    imageAlt: "Plans et équipements de construction",
    introduction: [
      "Choisir les matériaux de construction pour votre maison est une étape cruciale dans tout projet de construction ou de rénovation. Le bon choix garantit non seulement la solidité et la durabilité de votre habitation, mais aussi son confort, son esthétique et son efficacité énergétique. Dans cet article, nous vous guidons à travers les critères essentiels pour bien choisir les matériaux adaptés à votre projet.",
    ],
    sections: [
      { title: "1. Définir vos besoins et priorités", blocks: [
        { type: "paragraph", text: "Avant tout, il est important de déterminer vos priorités. Posez-vous les bonnes questions :" },
        { type: "list", items: ["Souhaitez-vous une maison écologique ?", "Cherchez-vous un bon rapport qualité/prix ?", "Privilégiez-vous l’isolation thermique ou acoustique ?", "Avez-vous un style architectural en tête (moderne, traditionnel, industriel…) ?"] },
        { type: "paragraph", text: "Vos réponses orienteront les types de matériaux à envisager." },
      ] },
      { title: "2. Les principaux matériaux à connaître", blocks: [
        { type: "subheading", text: "Le bois" },
        { type: "paragraph", text: "Avantages : Écologique, esthétique, bon isolant naturel, renouvelable." },
        { type: "paragraph", text: "Inconvénients : Nécessite un entretien régulier, peut craindre l’humidité et les insectes si mal traité." },
        { type: "subheading", text: "La brique" },
        { type: "paragraph", text: "Avantages : Bonne isolation, durable, résiste bien au feu et aux intempéries." },
        { type: "paragraph", text: "Inconvénients : Coût parfois plus élevé, nécessite un temps de pose plus long." },
        { type: "subheading", text: "Le béton" },
        { type: "paragraph", text: "Avantages : Très résistant, bon rapport qualité/prix, parfait pour les structures porteuses." },
        { type: "paragraph", text: "Inconvénients : Peu écologique (fort impact carbone), nécessite souvent un complément d’isolation." },
        { type: "subheading", text: "La pierre" },
        { type: "paragraph", text: "Avantages : Élégante, durable, très bonne isolation thermique." },
        { type: "paragraph", text: "Inconvénients : Lourde, coûteuse et plus difficile à poser." },
        { type: "subheading", text: "Le métal (acier, aluminium)" },
        { type: "paragraph", text: "Avantages : Solide, design contemporain, recyclable." },
        { type: "paragraph", text: "Inconvénients : Moins isolant, peut rouiller s’il n’est pas bien protégé." },
      ] },
      { title: "3. Pensez à l’efficacité énergétique", blocks: [
        { type: "paragraph", text: "Les matériaux que vous choisissez influencent directement la performance énergétique de votre maison. Par exemple :" },
        { type: "list", items: ["Une isolation thermique efficace permet de réduire les coûts de chauffage et de climatisation.", "Le triple vitrage pour les fenêtres améliore le confort tout en limitant les pertes de chaleur.", "Les matériaux à forte inertie thermique (comme la pierre ou le béton) permettent de réguler la température intérieure."] },
      ] },
      { title: "4. Le budget : trouver le bon équilibre", blocks: [
        { type: "paragraph", text: "Le coût est un facteur important, mais attention à ne pas sacrifier la qualité pour faire des économies à court terme. Un matériau moins cher aujourd’hui peut entraîner plus de dépenses demain (réparations, entretien, perte d’énergie…)." },
        { type: "paragraph", text: "Il est conseillé de comparer :" },
        { type: "list", items: ["Le coût d’achat", "Le coût de mise en œuvre", "Le coût d’entretien", "La durée de vie du matériau"] },
      ] },
      { title: "5. L’aspect écologique", blocks: [
        { type: "paragraph", text: "De plus en plus de propriétaires choisissent des matériaux durables et respectueux de l’environnement :" },
        { type: "list", items: ["Matériaux recyclés ou recyclables", "Bois certifié FSC", "Isolants naturels : laine de mouton, liège, chanvre, ouate de cellulose", "Peintures sans COV (composés organiques volatils)"] },
        { type: "paragraph", text: "Ces choix permettent de réduire l’empreinte carbone de la construction et d’améliorer la qualité de l’air intérieur." },
      ] },
      { title: "6. Le climat et la localisation", blocks: [
        { type: "paragraph", text: "Le climat de votre région joue un rôle clé dans le choix des matériaux :" },
        { type: "list", items: ["En zone humide, préférez des matériaux résistants à l’humidité (pierre, béton, brique).", "En zone chaude, privilégiez les matériaux respirants et frais comme la terre cuite ou le béton cellulaire.", "En montagne, misez sur l’isolation et la robustesse face aux conditions climatiques extrêmes."] },
      ] },
      { title: "7. Faites appel à des professionnels", blocks: [
        { type: "paragraph", text: "Même avec les meilleures informations, rien ne remplace les conseils d’un architecte ou d’un professionnel du bâtiment. Ils vous guideront selon :" },
        { type: "list", items: ["Les normes locales", "Le style de construction", "Votre budget", "Les contraintes du terrain"] },
      ] },
      { title: "Conclusion", blocks: [
        { type: "paragraph", text: "Choisir les bons matériaux pour votre maison, c’est avant tout trouver un équilibre entre esthétique, performance, durabilité, budget et respect de l’environnement. Prenez le temps de comparer, de vous informer, et n’hésitez pas à demander conseil à des professionnels pour garantir un résultat à la hauteur de vos attentes." },
      ] },
    ],
  },
  {
    title: "Construction sur-mesure : quels avantages pour votre projet ?",
    href: routes.helloWorld,
    category: "Gros œuvre",
    categoryHref: routes.categoryStructuralWork,
    published: "20 avril 2025",
    publishedIso: "2025-04-20",
    image: "/images/portfolio-2026/projects/villa-founty-construction.webp",
    imageAlt: "Construction de la Villa Founty",
    introduction: [
      "Faire construire sa maison ou son bâtiment sur-mesure est une solution de plus en plus prisée à Agadir et dans l’ensemble du Maroc. Contrairement aux constructions standardisées, un projet sur-mesure s’adapte entièrement à vos besoins, à votre mode de vie et aux particularités de votre terrain. La société S2MBOU, spécialisée dans la construction et l’aménagement à Agadir, vous accompagne dans la réalisation de projets personnalisés et de haute qualité.",
      "Dans cet article, nous vous expliquons les avantages clés d’une construction sur-mesure et pourquoi faire appel à S2MBOU peut faire toute la différence.",
    ],
    sections: [
      { title: "Une maison qui vous ressemble", blocks: [
        { type: "paragraph", text: "L’un des principaux atouts d’une construction sur-mesure est la liberté de conception. Vous êtes impliqué à chaque étape du projet : choix du style architectural, nombre de pièces, disposition des espaces, matériaux, finitions, etc." },
        { type: "paragraph", text: "Avec S2MBOU, vous bénéficiez d’une écoute attentive et d’un accompagnement professionnel pour concevoir une maison qui reflète vos goûts, vos besoins et votre style de vie." },
      ] },
      { title: "Optimisation de l’espace et du terrain", blocks: [
        { type: "paragraph", text: "Chaque terrain a ses spécificités : pente, orientation, vue, exposition au vent ou au soleil. Une construction sur-mesure permet d’exploiter au mieux les caractéristiques du terrain pour maximiser le confort et l’efficacité énergétique." },
        { type: "paragraph", text: "L’équipe de S2MBOU prend en compte tous ces paramètres pour vous proposer une implantation intelligente et un aménagement sur-mesure à Agadir et ses environs." },
      ] },
      { title: "Meilleure performance énergétique", blocks: [
        { type: "paragraph", text: "Une maison conçue sur-mesure permet d’intégrer les dernières solutions en matière d’isolation, d’équipements durables et d’énergie renouvelable. Cela se traduit par une réduction de la consommation énergétique et un meilleur confort thermique tout au long de l’année." },
        { type: "paragraph", text: "Grâce à son expertise locale, S2MBOU adapte les techniques de construction aux conditions climatiques d’Agadir pour garantir des performances optimales." },
      ] },
      { title: "Qualité de construction supérieure", blocks: [
        { type: "paragraph", text: "En optant pour une construction personnalisée, vous avez la possibilité de choisir des matériaux de qualité, durables et adaptés à vos attentes. Contrairement aux solutions « clé en main », où les choix sont souvent limités, la construction sur-mesure vous laisse la liberté de définir vos priorités." },
        { type: "paragraph", text: "La société S2MBOU collabore avec des fournisseurs de confiance et des artisans qualifiés pour garantir une finition impeccable et une longévité optimale." },
      ] },
      { title: "Aménagement intérieur sur-mesure", blocks: [
        { type: "paragraph", text: "La construction sur-mesure ne se limite pas à l’ossature du bâtiment. Elle permet également de créer un aménagement intérieur totalement personnalisé : cuisine ouverte, dressing sur mesure, salle de bain design, espaces de rangement intégrés, etc." },
        { type: "paragraph", text: "S2MBOU vous accompagne également dans l’aménagement de votre intérieur à Agadir, en vous proposant des solutions esthétiques, pratiques et en harmonie avec votre style." },
      ] },
      { title: "Un investissement rentable", blocks: [
        { type: "paragraph", text: "Bien qu’une construction sur-mesure puisse représenter un investissement légèrement supérieur au départ, elle permet souvent de réaliser des économies à long terme : réduction des charges énergétiques, absence de travaux à prévoir, valorisation du bien immobilier." },
        { type: "paragraph", text: "Avec l’expertise de S2MBOU, vous investissez dans une construction durable, fonctionnelle et évolutive, parfaitement adaptée à vos objectifs de vie ou à votre activité professionnelle." },
      ] },
      { title: "Conclusion", blocks: [
        { type: "paragraph", text: "Choisir la construction sur-mesure, c’est faire le choix de la personnalisation, de la qualité et de la performance. C’est aussi l’assurance d’un projet qui vous ressemble, pensé dans les moindres détails pour répondre à vos besoins actuels et futurs." },
        { type: "paragraph", text: "À Agadir, la société S2MBOU met à votre service son savoir-faire, son équipe expérimentée et son sens du détail pour faire de votre projet de construction ou d’aménagement un véritable succès." },
      ] },
    ],
  },
] as const;

export function getArticle(href: ProtectedRoute) {
  const article = blogArticles.find((item) => item.href === href);
  if (!article) throw new Error(`Article introuvable : ${href}`);
  return article;
}

