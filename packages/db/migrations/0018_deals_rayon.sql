-- Rayon d'origine du produit (Carrefour/Bringo), capturé depuis l'URL de
-- listing au moment du scrape (PR #101, mapCategorie() enrichi). Sans cette
-- colonne, l'information se perd à chaque run : la prochaine amélioration
-- du mapping devrait re-scraper pour la retrouver plutôt que relire la base.
-- Texte libre, nullable — seul Bringo la peuple aujourd'hui, les autres
-- sources laissent la colonne NULL.
alter table deals add column rayon text;
