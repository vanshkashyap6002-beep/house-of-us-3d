/* ============================================================
   HOUSE OF US — houseData
   This is the ONLY file a couple's content lives in.
   Swap the values below to personalize a new instance.
   Momently integration note: this whole object maps 1:1 onto
   a `customizationData` JSON field on your template-instance
   model — generate this object from the admin/customization
   studio form and inject it server-side before render.
   ============================================================ */

const houseData = {
  coupleId: "HOU-C8F2K91",
  privateKey: "HUS-7K4P-92LM",

  personOne: "Aanya",
  personTwo: "Kabir",
  familyName: "OUR LITTLE WORLD",

  favoriteFlower: "marigold", // marigold | rose | tulip | daisy

  finalMessage: "Made with love.",

  books: [
    {
      title: "Our Story",
      pages: [
        { caption: "How it started", text: "A rainy Tuesday, a shared umbrella, and neither of us wanting to say goodbye at the gate.", date: "March 2022" },
        { caption: "The first 'I love you'", text: "Said too fast, over the phone, both of us laughing out of nerves right after.", date: "June 2022" },
        { caption: "Meeting the families", text: "Two dinner tables, four nervous parents, one very relieved couple.", date: "January 2023" }
      ]
    },
    {
      title: "Our Memories",
      pages: [
        { caption: "Manali trip", text: "Frozen fingers, one shared jacket, and the best cup of chai either of us has had.", date: "December 2023" },
        { caption: "The terrible cooking attempt", text: "We set off the smoke alarm twice. The dal was somehow still good.", date: "August 2024" },
        { caption: "Rainy monsoon evening", text: "No plans, no phones, just the balcony, the rain, and us.", date: "July 2025" }
      ]
    },
    {
      title: "Our Letters",
      pages: [
        { caption: "For your birthday", text: "You make ordinary Tuesdays feel like something worth remembering.", date: "May 2024" },
        { caption: "For a hard week", text: "I don't have to fix it. I just want to sit in it with you.", date: "October 2024" }
      ]
    },
    {
      title: "Things I Love About You",
      pages: [
        { caption: "The little things", text: "The way you hum while making tea and pretend you don't.", date: "" },
        { caption: "The big things", text: "How safe it feels to be exactly myself around you.", date: "" }
      ]
    }
  ],

  videos: [
    { title: "The proposal", src: "", thumbnail: "" },
    { title: "Goofy dance in the kitchen", src: "", thumbnail: "" },
    { title: "Our trip to Goa", src: "", thumbnail: "" }
  ],

  quotes: [
    "Distance is only space between two places. It doesn't have to be space between two hearts.",
    "Somewhere between all the ordinary days, we became each other's favorite part.",
    "The best place is wherever we are together.",
    "Home isn't a place I go to. It's a person I found."
  ],

  quoteIntervalSeconds: 120
};
