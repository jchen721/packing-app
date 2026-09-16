function cleanText(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  }
  
  function classifyProduct(productName) {
    const name = cleanText(productName);

    // TikTok numbered mystery-box lines stay in Needs Review for workers, but
    // use a separate approved 7x5x5 inventory estimate per order.
    if (/\bbox\s*#\s*\d+\b/.test(name)) return "numberedReviewBoxes";
  
    // 24 Box products
    if (name.includes("blooming water")) return "box24";
    if (name.includes("paldean fates great tusk")) return "box24";
    if (name.includes("unova premium collection")) return "box24";
    if (name.includes("heavy hitters")) return "box24";
    if (name.includes("legendary warriors premium collection")) return "box24";
    if (
      name.includes("ascended heroes focused fighters premium collection") ||
      name.includes("ascended heroes focused collection")
    ) return "box24";

    // First Partner Series 2 and 3 collections use the same physical box
    // behavior as the approved Pokemon Day collection family.
    if (
      name.includes("first partner illustration collection") ||
      /first partner\s*-?\s*series\s+[23]\s+collection/.test(name)
    ) return "firstPartners";
  
    // 13x10x6 products
    if (name.includes("deluxe pin collection")) return "deluxePin";
  
    if (/\bbooster\s+display(?:\s+box(?:es)?)?\b/.test(name)) return "unknown";

    // The manager's current chart separates Japanese booster boxes from other
    // standard booster boxes because they use a different physical box.
    if (/\bbooster\s+box(?:es)?\b/.test(name)) {
      if (/\b(?:jp|japanese)\b/.test(name)) return "japaneseBoosterBoxes";
      return "boosterBoxes";
    }

    // Keep bundles distinct from actual tins so explicit ETB + bundle rules do
    // not accidentally apply to ETB + tin orders.
    if (/booster bundles?$/.test(name)) return "boosterBundles";
  
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

    // Named/special collection families above keep their approved sizes.
    // Remaining normal collection boxes use the manager's collection ladder.
    if (name.includes("victini") && /\bcollection(?:\s+box)?\b/.test(name)) {
      return "victiniCollections";
    }
    if (/\bcollection(?:\s+box)?\b/.test(name)) return "collectionBoxes";
  
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
      japaneseBoosterBoxes = 0,
      boosterBundles = 0,
      collectionBoxes = 0,
      victiniCollections = 0,
      numberedReviewBoxes = 0,
      deluxePin,
      box24,
      unknown
    } = counts;
  
    if (unknown > 0) return "Needs Review";
    if (numberedReviewBoxes > 0) return "Needs Review";

    // Only the single standard Booster Box rule is currently approved.
    // Multiple or mixed Booster Box orders remain in Needs Review until the
    // warehouse provides a capacity rule.
    if (boosterBoxes > 0 || japaneseBoosterBoxes > 0) {
      if (japaneseBoosterBoxes === 1 && boosterBoxes === 0 && onlyThese(counts, ["japaneseBoosterBoxes"])) {
        return "8x8x4";
      }
      if (boosterBoxes === 1 && onlyThese(counts, ["boosterBoxes"])) {
        return "7x5x5";
      }
      return "Needs Review";
    }
  
    // Long 24-series products use the shallow box unless one or more ETBs add
    // height. They remain consolidated into 24_Box.pdf for workers.
    if (box24 > 0) return etbs > 0 ? "24x12x6" : "24x12x4";

    // First Partner Series 2/3 quantities follow the same combinations as
    // Pokemon Day rather than requiring a named-product exception.
    const pokemonDayLike = pokemonDays + firstPartners;
  
    if (deluxePin > 0) return "13x10x6";

    // Two Victini collection boxes have a specifically approved footprint.
    if (victiniCollections > 0) {
      if (victiniCollections === 2 && onlyThese(counts, ["victiniCollections", "normalPacks", "sleevedPacks"])) {
        return "13x10x4";
      }
      // A single collection with one ETB follows the collection + ETB rule.
      if (victiniCollections === 1 && etbs === 1 && onlyThese(counts, ["victiniCollections", "etbs", "normalPacks", "sleevedPacks"])) {
        return "13x10x6";
      }
      return "Needs Review";
    }
  
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
  
    // Normal collection boxes use the manager's current collection ladder.
    if (collectionBoxes > 0) {
      if (collectionBoxes === 1 && largePremiums === 1 && etbs === 0 && onlyThese(counts, ["collectionBoxes", "largePremiums", "normalPacks", "sleevedPacks"])) return "16x12x6";
      if (collectionBoxes === 1 && largePremiums === 0 && etbs === 2 && onlyThese(counts, ["collectionBoxes", "etbs", "normalPacks", "sleevedPacks"])) return "16x12x6";
      if (collectionBoxes === 1 && largePremiums === 0 && etbs === 1 && onlyThese(counts, ["collectionBoxes", "etbs", "normalPacks", "sleevedPacks"])) return "13x10x6";
      if (collectionBoxes === 1 && largePremiums === 0 && etbs === 0 && onlyThese(counts, ["collectionBoxes", "normalPacks", "sleevedPacks"])) return "16x12x4";
      return "Needs Review";
    }

    // 16 family. Quantity-specific rules override the old single-item base.
    if (largePremiums > 0) {
      if (largePremiums === 3 && etbs === 0 && posters === 0 && pokemonDayLike === 0) return "16x12x12";
      if (largePremiums === 2 && etbs === 2 && posters === 0 && pokemonDayLike === 0) return "16x12x12";
      if (largePremiums === 2 && etbs === 0 && posters === 0 && pokemonDayLike === 0) return "16x12x8";
      if (largePremiums === 1 && etbs === 2 && posters === 0 && pokemonDayLike === 0) return "16x12x8";
      if (largePremiums === 1 && (etbs === 1 || pokemonDayLike >= 1 || posters >= 1)) return "16x12x6";
      if (largePremiums === 1) return "16x12x4";
      return "Needs Review";
    }
  
    // 13 family
    if (megaItems > 0) {
      if (etbs >= 2 && megaItems >= 2) return "13x10x8";
      if (etbs >= 1) return "13x10x6";
      return "13x10x4";
    }
  
    // Posters
    if (posters > 0) {
      if (etbs >= 4 && etbs <= 5) return "12x12x12";
      if (etbs === 3) return "11x11x9";
      if (etbs === 2) return "11x11x9";
      if (etbs === 1 && posters === 2) return "11x11x7";
      if (etbs === 1 && posters === 1) return "11x11x5";
      if (etbs === 0 && posters === 2) return "11x11x5";
      // The warehouse eliminated 11x11x3; one poster uses 11x11x5.
      if (etbs === 0 && posters === 1) return "11x11x5";
      return "Needs Review";
    }
  
    // Pokemon Day
    if (pokemonDayLike > 0) {
      if (etbs >= 2) return "11x11x5";
      if (etbs === 1) return "8x8x8";
      return "8x8x4";
    }
  
    // ETB ladder from the manager's current physical-box chart.
    if (etbs === 6) return "16x12x8";
    if (etbs >= 4 && etbs <= 5) return "12x12x12";
    if (etbs === 3) return "11x11x7";
    if (etbs === 2 && boosterBundles > 0) return "11x11x7";
    if (etbs === 2) return "8x8x8";
    if (etbs === 1) return "8x8x4";
    if (etbs > 6) return "Needs Review";
  
    // Tins / bundles only, or with packs/sleeves.
    if (tins + boosterBundles > 0 && tins + boosterBundles <= 6) return "6x6x6";
    if (tins + boosterBundles > 6) return "Needs Review";
  
    return "Needs Review";
  }

  function chooseInventoryPackingGroup(counts, exactPackingGroup = chooseBox(counts)) {
    if (Number(counts?.numberedReviewBoxes || 0) > 0) return "7x5x5";
    return exactPackingGroup;
  }
  
  module.exports = {
    classifyProduct,
    chooseBox,
    chooseInventoryPackingGroup
  };
