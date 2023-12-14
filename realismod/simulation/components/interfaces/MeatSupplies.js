Engine.RegisterInterface("MeatSupplies");

/**
 * Message of the form { "from": number, "to": number }
 * sent from Health component whenever health changes.
 */
Engine.RegisterMessageType("MeatSuppliesChanged");
