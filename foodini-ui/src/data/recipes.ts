import type { IngredientItem, Recipe, RecipeTag, ShopCategory, UnitType } from '../types.ts'

export const tagLabels: Record<RecipeTag, string> = {
  'low-gi': 'Niski IG',
  'dairy-free': 'Bez nabiału',
  quick: 'Do 25 minut',
  vegetarian: 'Wegetariańskie',
  vegan: 'Wegańskie',
  'high-protein': 'Wysokobiałkowe',
  'one-pot': 'Jednogarnkowe',
}

export const categoryLabels: Record<ShopCategory, string> = {
  produce: 'Warzywa i owoce',
  dairy: 'Nabiał i jaja',
  bakery: 'Pieczywo',
  meat_fish_tofu: 'Mięso, ryby i tofu',
  grains_pantry: 'Produkty sypkie',
  canned_condiments: 'Przetwory i przyprawy',
  other: 'Inne',
}

export const unitLabels: Record<UnitType, string> = {
  g: 'g', ml: 'ml', pcs: 'szt.', tbsp: 'łyż.', tsp: 'łyżecz.',
  clove: 'ząb.', can: 'pusz.', pack: 'opak.', pinch: 'szczypt.',
}

const ingredient = (id: string, name: string, amount: number, unit: UnitType, category: ShopCategory): IngredientItem =>
  ({ id, name, amount, unit, category })

const onion = (amount = 1) => ingredient('onion', 'Cebula', amount, 'pcs', 'produce')
const garlic = (amount = 2) => ingredient('garlic', 'Czosnek', amount, 'clove', 'produce')
const oil = (amount = 1) => ingredient('olive-oil', 'Oliwa z oliwek', amount, 'tbsp', 'canned_condiments')
const chicken = (amount = 300) => ingredient('chicken-breast', 'Pierś z kurczaka', amount, 'g', 'meat_fish_tofu')
const rice = (amount = 150) => ingredient('brown-rice', 'Ryż brązowy', amount, 'g', 'grains_pantry')
const carrot = (amount = 2) => ingredient('carrot', 'Marchew', amount, 'pcs', 'produce')
const pepper = (amount = 1) => ingredient('red-pepper', 'Papryka czerwona', amount, 'pcs', 'produce')
const potatoes = (amount = 400) => ingredient('potatoes', 'Ziemniaki', amount, 'g', 'produce')
const passata = (amount = 300) => ingredient('tomato-passata', 'Passata pomidorowa', amount, 'ml', 'canned_condiments')
const salt = () => ingredient('salt', 'Sól', 1, 'pinch', 'canned_condiments')

export const recipes: Recipe[] = [
  {
    id: 'chickpea-curry',
    name: 'Curry z ciecierzycy',
    description: 'Kremowe, kokosowe curry ze szpinakiem, podane na brązowym ryżu.',
    mealType: 'lunch', prepTimeMinutes: 35, difficulty: 'easy', basePortions: 2,
    tags: ['vegan', 'vegetarian', 'dairy-free'],
    imageUrl: '/images/curry.jpg',
    ingredients: [
      ingredient('canned-chickpeas', 'Ciecierzyca konserwowa (po odsączeniu)', 240, 'g', 'canned_condiments'),
      rice(), ingredient('coconut-milk', 'Mleczko kokosowe', 200, 'ml', 'canned_condiments'),
      ingredient('spinach', 'Szpinak', 100, 'g', 'produce'), passata(200), onion(), garlic(), oil(),
      ingredient('curry-powder', 'Przyprawa curry', 2, 'tsp', 'canned_condiments'), salt(),
    ],
    instructions: [
      'Ugotuj brązowy ryż zgodnie z instrukcją na opakowaniu.',
      'Posiekaj cebulę i czosnek. Na głębokiej patelni rozgrzej oliwę i zeszklij cebulę przez 5 minut.',
      'Dodaj czosnek i curry. Wymieszaj, a po minucie dodaj passatę, mleczko kokosowe i odsączoną ciecierzycę.',
      'Duś przez 12–15 minut. Dodaj szpinak i gotuj jeszcze 2 minuty, aż liście zmiękną. Dopraw solą.',
      'Podawaj curry na brązowym ryżu.',
    ],
  },
  {
    id: 'butter-chicken', name: 'Butter chicken',
    description: 'Soczysty kurczak w aksamitnym sosie pomidorowym z masłem i garam masalą.',
    mealType: 'lunch', prepTimeMinutes: 40, difficulty: 'easy', basePortions: 2,
    tags: ['high-protein'], imageUrl: '/images/butter-chicken.jpg',
    ingredients: [chicken(), rice(), passata(), onion(), garlic(),
      ingredient('butter', 'Masło', 25, 'g', 'dairy'),
      ingredient('cream', 'Śmietanka 30%', 100, 'ml', 'dairy'),
      ingredient('natural-yogurt', 'Jogurt naturalny', 100, 'g', 'dairy'),
      ingredient('garam-masala', 'Garam masala', 2, 'tsp', 'canned_condiments'),
      ingredient('ginger', 'Imbir świeży', 10, 'g', 'produce'), salt()],
    instructions: [
      'Pokrój kurczaka w kostkę i wymieszaj z jogurtem oraz połową garam masali. W tym czasie zacznij gotować ryż.',
      'Posiekaj cebulę, czosnek i imbir. Rozgrzej masło, zeszklij cebulę, następnie dodaj czosnek, imbir i resztę przyprawy.',
      'Dodaj kurczaka z jogurtem i smaż, mieszając, przez 5 minut.',
      'Wlej passatę i duś przez około 15 minut, aż kurczak będzie całkowicie ugotowany.',
      'Dodaj śmietankę, dopraw solą i delikatnie podgrzej. Podawaj z ryżem.',
    ],
  },
  {
    id: 'konjac-chicken', name: 'Konjac z kurczakiem',
    description: 'Makaron konjac, chrupiące warzywa i sos sojowy z masłem orzechowym.',
    mealType: 'dinner', prepTimeMinutes: 25, difficulty: 'easy', basePortions: 2,
    tags: ['quick', 'dairy-free', 'high-protein'], imageUrl: '/images/konjac.jpg',
    ingredients: [
      ingredient('konjac-noodles', 'Makaron konjac', 400, 'g', 'grains_pantry'), chicken(), carrot(1), pepper(), garlic(), oil(),
      ingredient('broccoli', 'Brokuł', 200, 'g', 'produce'),
      ingredient('soy-sauce', 'Sos sojowy', 3, 'tbsp', 'canned_condiments'),
      ingredient('peanut-butter', 'Masło orzechowe', 2, 'tbsp', 'canned_condiments'),
      ingredient('lime', 'Limonka', 1, 'pcs', 'produce'),
    ],
    instructions: [
      'Przepłucz makaron konjac i przygotuj według instrukcji na opakowaniu.',
      'Pokrój kurczaka w paski, marchew i paprykę w cienkie słupki, a brokuł w małe różyczki.',
      'Wymieszaj sos sojowy z masłem orzechowym, sokiem z limonki i kilkoma łyżkami ciepłej wody.',
      'Na oliwie usmaż kurczaka, aż będzie całkowicie ugotowany. Dodaj posiekany czosnek i warzywa. Smaż jeszcze 5–7 minut.',
      'Dodaj makaron i sos. Wymieszaj i podgrzewaj przez 2 minuty.',
    ],
  },
  {
    id: 'turkey-meatballs', name: 'Pulpety w sosie pomidorowym',
    description: 'Delikatne pulpety z indyka, pomidorowy sos i brązowy ryż.',
    mealType: 'lunch', prepTimeMinutes: 40, difficulty: 'easy', basePortions: 2,
    tags: ['high-protein'], imageUrl: '/images/meatballs.jpg',
    ingredients: [
      ingredient('ground-turkey', 'Mięso mielone z indyka', 350, 'g', 'meat_fish_tofu'),
      ingredient('egg', 'Jajko', 1, 'pcs', 'dairy'),
      ingredient('breadcrumbs', 'Bułka tarta', 30, 'g', 'grains_pantry'),
      passata(400), onion(), garlic(), rice(), oil(), salt(),
      ingredient('oregano', 'Oregano suszone', 1, 'tsp', 'canned_condiments'),
    ],
    instructions: [
      'Zacznij gotować ryż. Połowę cebuli drobno posiekaj i wymieszaj z mięsem, jajkiem, bułką tartą i solą.',
      'Zwilż dłonie i uformuj niewielkie pulpety.',
      'W szerokim garnku rozgrzej oliwę. Zeszklij resztę cebuli, dodaj czosnek, passatę i oregano.',
      'Włóż pulpety do sosu, przykryj i duś na małym ogniu przez 20–25 minut, aż mięso będzie ugotowane w środku.',
      'Podawaj pulpety z sosem i brązowym ryżem.',
    ],
  },
  {
    id: 'beef-stew', name: 'Gulasz wołowy',
    description: 'Wolno duszona wołowina z papryką i marchewką. Klasyka na dwa dni.',
    mealType: 'lunch', prepTimeMinutes: 120, difficulty: 'medium', basePortions: 2,
    tags: ['dairy-free', 'high-protein', 'one-pot'], imageUrl: '/images/stew.jpg',
    ingredients: [
      ingredient('beef-stew', 'Wołowina gulaszowa', 400, 'g', 'meat_fish_tofu'),
      onion(), garlic(), carrot(), pepper(), potatoes(), passata(200), oil(), salt(),
      ingredient('sweet-paprika', 'Papryka słodka mielona', 2, 'tsp', 'canned_condiments'),
      ingredient('bay-leaf', 'Liść laurowy', 2, 'pcs', 'canned_condiments'),
    ],
    instructions: [
      'Pokrój wołowinę w kostkę. Cebulę i paprykę pokrój w kawałki, marchew w plasterki, a ziemniaki w dużą kostkę.',
      'W garnku z grubym dnem rozgrzej oliwę i obsmaż mięso partiami. Dodaj cebulę oraz czosnek.',
      'Wsyp słodką paprykę, dodaj passatę i liście laurowe. Wlej wodę do przykrycia mięsa.',
      'Duś pod przykryciem na małym ogniu przez około 75 minut. W razie potrzeby dolewaj wodę.',
      'Dodaj marchew, paprykę i ziemniaki. Duś jeszcze 25–30 minut, aż mięso i warzywa będą miękkie. Dopraw solą.',
    ],
  },
  {
    id: 'vegetable-bake', name: 'Zapiekanka warzywna',
    description: 'Kolorowe warzywa pod złotą mozzarellą, prosto z naczynia żaroodpornego.',
    mealType: 'dinner', prepTimeMinutes: 45, difficulty: 'easy', basePortions: 2,
    tags: ['vegetarian', 'one-pot'], imageUrl: '/images/bake.jpg',
    ingredients: [
      ingredient('zucchini', 'Cukinia', 1, 'pcs', 'produce'),
      ingredient('broccoli', 'Brokuł', 250, 'g', 'produce'), pepper(), potatoes(), onion(), garlic(), oil(), salt(),
      ingredient('mozzarella', 'Mozzarella', 125, 'g', 'dairy'),
      ingredient('oregano', 'Oregano suszone', 1, 'tsp', 'canned_condiments'),
    ],
    instructions: [
      'Nagrzej piekarnik do 190°C. Ziemniaki pokrój w cienkie plasterki i podgotuj przez 8 minut.',
      'Cukinię pokrój w półplasterki, paprykę i cebulę w kawałki, a brokuł w małe różyczki.',
      'Włóż warzywa do naczynia żaroodpornego. Dodaj oliwę, posiekany czosnek, oregano i sól. Wymieszaj.',
      'Przykryj naczynie i piecz przez 20 minut. Zdejmij pokrywkę, dodaj porwaną mozzarellę i piecz jeszcze 10–15 minut.',
      'Sprawdź, czy ziemniaki są miękkie. Przed podaniem odstaw na kilka minut.',
    ],
  },
  {
    id: 'roast-pork', name: 'Schab z rękawa z warzywami',
    description: 'Soczysty schab, ziemniaki i warzywa pieczone razem. Piekarnik robi swoje.',
    mealType: 'lunch', prepTimeMinutes: 80, difficulty: 'easy', basePortions: 2,
    tags: ['dairy-free', 'high-protein', 'one-pot'], imageUrl: '/images/roast.jpg',
    ingredients: [
      ingredient('pork-loin', 'Schab wieprzowy', 400, 'g', 'meat_fish_tofu'),
      potatoes(500), carrot(), onion(), pepper(), garlic(), oil(), salt(),
      ingredient('marjoram', 'Majeranek suszony', 2, 'tsp', 'canned_condiments'),
      ingredient('sweet-paprika', 'Papryka słodka mielona', 1, 'tsp', 'canned_condiments'),
    ],
    instructions: [
      'Rozgrzej piekarnik do 180°C. Pokrój schab w grube plastry, a warzywa w podobnej wielkości kawałki.',
      'Wymieszaj oliwę z przeciśniętym czosnkiem, majerankiem, słodką papryką i solą. Natrzyj mięso i warzywa.',
      'Przełóż wszystko do rękawa do pieczenia. Zamknij i przygotuj rękaw zgodnie z instrukcją producenta.',
      'Ułóż w naczyniu żaroodpornym i piecz przez około 60 minut, aż mięso będzie całkowicie upieczone, a warzywa miękkie.',
      'Ostrożnie otwórz rękaw, uważając na parę. Odstaw mięso na kilka minut i podawaj z warzywami.',
    ],
  },
]
