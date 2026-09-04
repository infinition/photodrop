# PhotoDrop

Application web locale pour transferer rapidement des photos depuis un smartphone Android vers un dossier sur le Bureau de votre PC via le reseau Wi-Fi local.

## Fonctionnement

1. Lancez le serveur sur votre PC via `start.bat` ou la commande `npm start`.
2. Le tableau de bord s'ouvre sur votre ecran de PC avec un QR code.
3. Scannez le QR code avec l'appareil photo ou le lecteur de QR code de votre smartphone Android.
4. L'application mobile s'ouvre dans le navigateur de votre telephone.
5. Selectionnez une ou plusieurs photos depuis votre galerie Android.
6. Choisissez les photos a conserver ou a deselectionner grace aux cases a cocher.
7. Cliquez sur "Envoyer vers le PC".
8. Les photos sont transferees instantanement dans le dossier `Photos_Transfert` sur votre Bureau.

## Prerequis

- Node.js version 18 ou superieure.
- Le smartphone et le PC doivent etre connectes au meme reseau Wi-Fi ou reseau local.

## Lancement rapide

Double-cliquez sur `start.bat` dans ce dossier.

Ou en ligne de commande :

```bash
npm start
```

## Structure du projet

- `server.js` : serveur Express avec streaming multipart, detection d'IP LAN et Server-Sent Events.
- `locales/` : fichiers de traductions (Francais, Anglais).
- `public/index.html` : tableau de bord pour PC avec QR code et historique en direct.
- `public/mobile.html` : interface responsive mobile pour smartphone Android et iOS.
- `public/css/` : styles modernes adaptes aux ecrans tactiles, marges systeme et encoches.
- `public/js/` : logique de selection de photos, previsualisation, calcul de progres et i18n.
