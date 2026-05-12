window.SHOP_CONFIG = {
  shopName: "AMEZ",
  currencyLabel: "HK$",

  // Free shipping when subtotal reaches this amount (HK$)
  freeShippingAtAmount: 240,
  shippingFee: 30,

  // Payment
  payMeUrl: "https://payme.hsbc/996976ef1a4840e397b5d218c81a662a",
  fpsId: "128799590",
  fpsNote: "Please put the Order ID in the transfer remark.",

  // Contact (WhatsApp: full international number without +; URL built in app.js)
  contactPhone: "90137619",
  contactWhatsappCountryCode: "852",
  contactEmail: "amezcoffeehk@gmail.com",

  // Google Apps Script Web App — receives order + payment proof image
  orderEndpoint:
    "https://script.google.com/macros/s/AKfycbw-TRIuKjJU0aoqUb_knTEmnYL64Nnf1VjUnuk5MkJBQWnfc0_egWAjYP8kFTOOfyALpQ/exec",
};
