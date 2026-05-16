window.SHOP_CONFIG = {
  shopName: "AMEZ",
  currencyLabel: "HK$",

  // Free shipping when subtotal reaches this amount (HK$)
  freeShippingAtAmount: 250,
  /** Standard shipping below discount tier (HK$) */
  shippingFee: 30,
  /** From this subtotal (HK$), deduct shippingDiscountAmount from standard shipping (until free-ship) */
  shippingDiscountFromAmount: 200,
  shippingDiscountAmount: 20,

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
