// Kora · preset Tailwind 3 : presets: [require('./tailwind.preset.js')]
// Source : tokens.json.
module.exports = {
  theme: {
    extend: {
      colors: {
        "surface": "#FBF9F4",
        "on-surface": "#242119",
        "on-surface-variant": "#75726A",
        "primary": "#906D03",
        "on-primary": "#FFFFFF",
        "outline-variant": "#E3DED1",
      },
      fontFamily: {
        "titre": ["Crimson Pro", "serif"],
        "corps": ["Plus Jakarta Sans", "sans-serif"],
      },
      fontWeight: {
        "titre-700": "700",
        "titre-800": "800",
        "corps-400": "400",
        "corps-600": "600",
      },
      fontSize: {
        "13": "13px",
        "16": "16px",
        "26": "26px",
        "48": "48px",
      },
      borderRadius: {
        "carte": "8px",
        "petit": "4px",
      },
    },
  },
};
