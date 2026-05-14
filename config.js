window.SHOP_CONFIG = {
  shopName: "AMEZ",
  currencyLabel: "HK$",

  // Free shipping when subtotal reaches this amount (HK$)
  freeShippingAtAmount: 250,
  /** Below free-ship: default shipping (HK$) */
  shippingFee: 30,
  /** When cart subtotal is exactly this (HK$), use reduced shipping instead of shippingFee */
  shippingDiscountSubtotal: 240,
  shippingFeeAtDiscountSubtotal: 10,

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
    "https://script.google.com/macros/s/AKfycbw5sPHhsLdPpBXgqS1iCYNAylLZmuA2GM5MhWad8Y-3UN9WKs3mWs23Hc74DP-p9jgJJg/exec",
};
