const { updatePickingChecklist } = require("./pickingChecklist");

const testItems = {
  "Chaos Rising ETB": 35,
  "Pokemon Day 2026 Collection": 7,
  "Random Booster Pack": 419
};

updatePickingChecklist(testItems)
  .then(result => {
    console.log("Checklist test successful:", result);
  })
  .catch(error => {
    console.error("Checklist test failed:");
    console.error(error);
  });