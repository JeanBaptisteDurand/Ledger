# PORTE DE SORTIE

> **Un agent ne peut pas entrer dans une position dont il ne sait pas sortir.**
>
> *Inside the mandate the agent acts on its own. It can never enter a position it cannot exit —
> the vault checks the way out in the same transaction. Anything else comes back to the Flex.*

Tout le monde borne ce qu'un agent **engage** : un plafond par jour, une liste de contrats, un
glissement maximal. Personne ne vérifie ce qu'il pourra **récupérer**. Ça vaut pour un jeton qu'un hook
empêche de revendre, pour un coffre à rendement dont on ne sort qu'après sept jours de file d'attente,
et pour toute position qu'on prend en une transaction et qu'on quitte en trois semaines — ou jamais.

**L'instance démontrée ici est le swap Uniswap v4**, parce que c'est là qu'on sait prouver le nombre :
un Ledger Flex émulé, un mandat lu et signé **sur l'appareil**, et un coffre qui refuse d'entrer là
d'où on ne sort pas — sur un fork de Base épinglé au bloc **50 614 000**. Les coffres ERC-4626 sont la
**seconde instance, construite** : dix coffres WETH réels de Base (Morpho), sous le même mandat, avec le
même refus. Le standard y écrit le piège lui-même — `previewRedeem` doit ignorer les limites de retrait —
et au bloc des mesures le plus gros coffre WETH de Base a **27 % de la position de son plus gros
déposant bloquée**, pendant que cinq coffres sur dix refusent même le dépôt. Détail plus bas.

---

