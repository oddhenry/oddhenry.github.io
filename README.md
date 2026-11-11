# oddhenry.github.io

Små nettsider og eksperimenter, publisert med GitHub Pages på
<https://oddhenry.github.io/>.

## Oppbygning

Hver nettside bor i sin egen mappe og er helt selvstendig. Forsiden
(`index.html` i roten) er bare en liste med lenker til dem.

```
index.html          forsiden med oversikt over alle sidene
ukjent-farvann/     https://oddhenry.github.io/ukjent-farvann/
.nojekyll           ber GitHub servere filene som de er, uten Jekyll
```

## Legge til en ny nettside

1. Lag en mappe med et kort navn uten mellomrom, f.eks. `min-ide/`, med
   en `index.html` i. Mappenavnet blir adressen.
2. Bruk relative lenker inne i mappen (`style.css`, ikke `/style.css`),
   så virker siden uansett hvor den ligger.
3. Kopier et `<li>` i `index.html` i roten og pek det til den nye mappen.
4. Alle sidene deler samme domene og dermed samme `localStorage`. Gi
   derfor lagringsnøkler et eget prefiks per side, slik `ukjent-farvann`
   bruker `ukjentfarvann.v1`.

Alt som havner på `main`, publiseres automatisk etter et minutts tid.

## Sidene

- **[Ukjent farvann](ukjent-farvann/)** foreslår nettsteder du ikke har
  besøkt, husker hva du liker og misliker, og blander kjente temaer med
  ukjente. Katalogen ligger i `ukjent-farvann/sites.js`.
