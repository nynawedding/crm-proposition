# Connecter le portail client à Google Drive et Sheets

Cette installation se fait une seule fois et prend environ 5 minutes, depuis votre compte Google.

1. Ouvrez https://script.google.com, puis cliquez sur **Nouveau projet**. Nommez le projet « CRM Portail client ».
2. Effacez le contenu du fichier `Code.gs` et collez à la place tout le contenu du fichier `crm/apps-script/Code.gs`. Enregistrez.
3. Dans la liste des fonctions en haut, choisissez **installer**, puis cliquez sur **Exécuter**.
   - Google vous demande d'autoriser l'accès à Drive et à Sheets : acceptez, avec votre propre compte.
   - Dans le **Journal d'exécution**, copiez la **clé d'administration** qui s'affiche.
4. Cliquez sur **Déployer → Nouveau déploiement → Type : Application Web**, avec ces réglages :
   - Exécuter en tant que : **Moi** ;
   - Qui a accès : **Tout le monde**.
   Cliquez ensuite sur **Déployer**, puis copiez l'**URL de l'application Web**. Elle se termine par `/exec`.
5. Dans le CRM, ouvrez **Réglages → Portail client**, collez l'URL et la clé d'administration, puis cliquez sur **Tester la connexion**.

**Où arrivent les données**
- Les réponses arrivent dans la feuille « CRM Portail client ».
- Les fichiers arrivent dans le dossier Drive « CRM Portail client », avec un sous-dossier par client et par catégorie. Ils restent privés : vous seul y avez accès.

**Si vous modifiez le script plus tard**
Allez dans **Déployer → Gérer les déploiements → Modifier → Nouvelle version**. L'URL reste la même.
