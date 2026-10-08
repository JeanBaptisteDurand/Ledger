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

## Le problème

Tu confies un budget à un agent. Tu l'as bordé : plafond, contrats autorisés, glissement maximal. Il
respecte tout — et il peut quand même prendre une position **dont il ne sortira jamais**.

Sur Uniswap v4, le *hook* d'un pool décide qui a le droit de vendre. Les 16 et 17 septembre 2026, le
registre officiel des hooks Uniswap a fusionné trois hooks dont son propre robot écrit
*« HONEYPOT WARNING … enabling a rug/honeypot after users have already bought »* — et les a classés
`vanillaSwap: true`. Dans les 125 072 mesures de [TARE](../ETH_Online_2026), **six pools laissent entrer
pour 0 bps et prennent 9 990 à 9 999 bps à la sortie**.

- `amountOutMinimum` ne le voit pas : il borne **cet** achat, pas la revente, qui n'existe pas encore.
- Un plafond de dépense ne le voit pas : les fonds sont dépensés dans les règles.
- Transaction Check regarde le **jeton**, pas le **hook**.

**Tout le monde surveille l'entrée. Personne ne vérifie la sortie.** Et ce n'est pas propre aux
memecoins : un délai de retrait, une file d'attente, un plafond de sortie journalier ou un verrou
posent la même question, sur des marchés bien plus grands.

## Le mécanisme

1. **Le porteur signe un mandat, une fois, sur son Ledger** — lisible champ par champ :
   `Budget : 1 WETH · Max round-trip loss (bps) : 300 · Expires : …`
2. **`ExitVault` garde la règle.** L'agent n'a jamais les fonds : il appelle le coffre.
3. **À chaque achat, le coffre simule la revente intégrale dans la même transaction.** Si la sortie
   coûte plus que le mandat n'autorise — ou si le hook refuse la vente — la transaction est annulée
   avant d'exister.

La simulation est gratuite et n'écrit rien : c'est le motif du `V4Quoter` d'Uniswap
(`try poolManager.unlock(...) {} catch`, le callback revert avec son résultat). Elle revend **la
totalité** de ce qui vient d'être acheté : un piège à seuil de taille ne passe pas au travers.

## L'escalade — « hors bornes ne veut pas dire non »

C'est la seconde moitié du modèle de Ledger : *« si un agent tente une action hors de ces bornes,
elle est automatiquement renvoyée à l'humain pour approbation »*. Le coffre ne se contente donc pas
de refuser : il prépare une question.

Le porteur lit sur son Flex, en clair :

![la dérogation](captures/escalade/03.png)

et signe — ou non — une **dérogation à usage unique**, liée à ce pool, ce montant, et **au nombre
qu'il vient de lire**. Six tests couvrent ce qu'elle ne permet pas :

```
test_1  refusé par le mandat, puis autorisé par la dérogation
test_2  une dérogation ne sert qu'une fois
test_3  la sortie a empiré depuis l'écran -> la dérogation ne vaut plus
test_4  une dérogation pour un pool ne vaut pas pour un autre
test_5  une dérogation n'est pas un blanc-seing : le budget s'applique toujours
test_6  une dérogation signée par quelqu'un d'autre ne vaut rien
```

Et une sortie **bloquée** (jeton non transférable, 10 000 bps) n'est jamais négociable : aucune
dérogation ne rend un jeton transférable, donc la question n'est même pas posée.

## Plusieurs agents

Le coffre l'est déjà, sans une ligne de plus : un mandat = un agent = un budget = un seuil. Cinq
tests le montrent — budgets séparés, pas d'emprunt de mandat, seuil de sortie par agent, révocation
à la pièce depuis l'appareil. **La limite, dite franchement :** les budgets sont séparés, *la
trésorerie ne l'est pas*. Si un agent vide le coffre, l'autre est dans son mandat mais sans fonds.
Pour isoler les fonds, il faut un coffre par agent.

