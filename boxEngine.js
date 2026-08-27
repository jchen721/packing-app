function cleanText(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  
  function classifyProduct(productName) {
    const name = cleanText(productName);
  
    // 24 Box products
    if (name.includes("blooming water")) return "box24";
    if (name.includes("paldean fates great tusk")) return "box24";
    if (name.includes("unova premium collection")) return "box24";
    if (name.includes("heavy hitters")) return "box24";
    if (
      name.includes("ascended heroes focused fighters premium collection") ||
      name.includes("ascended heroes focused collection")
    ) return "box24";

    // First Partner Series 3 collections use the same physical box behavior
    // as the approved Pokemon Day collection family.
    if (
      name.includes("first partner illustration collection") ||
      name.includes("first partner - series 3 collection") ||
      name.includes("first partner series 3 collection")
    ) return "firstPartners";
  
    // 13x10x6 products
    if (name.includes("deluxe pin collection")) return "deluxePin";
  
    // Standard Booster Boxes use the temporary 7x5x5 supply. Booster Display
    // products remain unapproved and continue to manual review.
    if (/\bbooster\s+box(?:es)?\b/.test(name)) return "boosterBoxes";
    if (/\bbooster\s+display(?:\s+box(?:es)?)?\b/.test(name)) return "unknown";

    // Booster bundles share the 6x6x6 packing rules regardless of set name.
    if (/booster bundles?$/.test(name)) return "tins";
  
    // ETBs
    if (name.includes("etb") || name.includes("elite trainer box")) {
      return "etbs";
    }
  
    // Sleeves
    if (name.includes("sleeve")) return "sleevedPacks";
  
    // 13 Box mega products
    if (
      name.includes("latias") ||
      name.includes("latios") ||
      name.includes("kangaskhan") ||
      (name.includes("ascended heroes") && name.includes("mega"))
    ) {
      return "megaItems";
    }
  
    // 16 Box products
    if (
      name.includes("mega charizard") ||
      name.includes("mega zygarde") ||
      name.includes("ultra premium") ||
      name.includes("upc") ||
      name.includes("spc") ||
      name.includes("super premium") ||
      name.includes("team rocket") ||
      name.includes("moltres")
    ) {
      return "largePremiums";
    }
  
    // Packs
    if (
      name.includes("random booster pack") ||
      name.includes("booster pack") ||
      name.includes("gem 4 booster pack") ||
      name.includes(" pack")
    ) {
      return "normalPacks";
    }
  
    // Tins
    if (/\btins?\b/.test(name)) return "tins";
  
    // Pokemon Day
    if (name.includes("pokemon day")) return "pokemonDays";
  
    // Posters
    if (name.includes("poster")) return "posters";
  
    return "unknown";
  }
  
  function onlyThese(counts, allowed) {
    for (const [key, value] of Object.entries(counts)) {
      if (value > 0 && !allowed.includes(key)) return false;
    }
    return true;
  }
  
  function chooseBox(counts) {
    const {
      normalPacks,
      sleevedPacks,
      etbs,
      tins,
      posters,
      pokemonDays,
      firstPartners = 0,
      megaItems,
      largePremiums,
      boosterBoxes = 0,
      deluxePin,
      box24,
      unknown
    } = counts;
  
    if (unknown > 0) return "Needs Review";

    // Only the single standard Booster Box rule is currently approved.
    // Multiple or mixed Booster Box orders remain in Needs Review until the
    // warehouse provides a capacity rule.
    if (boosterBoxes > 0) {
      if (boosterBoxes === 1 && onlyThese(counts, ["boosterBoxes"])) {
        return "7x5x5";
      }
      return "Needs Review";
    }
  
    if (box24 > 0) return "24 Box";

    // One First Partner collection is approved as Pokemon Day-sized. Larger
    // quantities and mixed First Partner/Pokemon Day orders are not approved.
    if (firstPartners > 1 || (firstPartners > 0 && pokemonDays > 0)) {
      return "Needs Review";
    }

    const pokemonDayLike = pokemonDays + firstPartners;
  
    if (deluxePin > 0) return "13x10x6";
  
    // Sleeves only
    if (sleevedPacks > 0 && onlyThese(counts, ["sleevedPacks"])) {
      return "Sleeved Packs";
    }
  
    // Packs + sleeves only
    if (
      normalPacks > 0 &&
      onlyThese(counts, ["normalPacks", "sleevedPacks"])
    ) {
      return "Packs Only";
    }
  
    // 16 family
    if (largePremiums > 0) {
      if (etbs >= 2) return "16x12x8";
      if (etbs === 1 || pokemonDayLike >= 1 || posters >= 1) return "16x12x6";
      return "16x12x4";
    }
  
    // 13 family
    if (megaItems > 0) {
      if (etbs >= 2 && megaItems >= 2) return "13x10x8";
      if (etbs >= 1) return "13x10x6";
      return "13x10x4";
    }
  
    // ETB-heavy orders
    if (etbs >= 5) return "24 Box";
    if (etbs === 4) return "16x12x8";
    if (etbs === 3) return "11x11x7";
  
    // Posters
    if (posters > 0) {
      if (etbs >= 2) return "11x11x9";
      return "11x11x5";
    }
  
    // Pokemon Day
    if (pokemonDayLike > 0) {
      if (etbs >= 2) return "11x11x5";
      if (etbs === 1) return "8x8x8";
      return "8x8x4";
    }
  
    // ETBs only, or ETBs with packs/sleeves/tins
    if (etbs === 2) return "8x8x8";
    if (etbs === 1) return "8x8x4";
  
    // Tins / bundles only, or tins with packs/sleeves
    if (tins > 0 && tins <= 6) return "6x6x6";
    if (tins > 6) return "Needs Review";
  
    return "Needs Review";
  }
  
  module.exports = {
    classifyProduct,
    chooseBox
  };
