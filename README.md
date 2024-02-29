# ev-charging-cost
Scroll through emails to get start/stop times for subaru charging

Generate your own creds as `credentials.json` from gcp

## Run the code

```
yarn install
yarn start
```

## Costs

```
const MAX_PRICE = MAX_KWH * PEAK_PRICE // 4.664
const MIN_PRICE = MAX_KWH * OFF_PEAK_PRICE // 2.99
```

Assuming 34 mpg, min/max ev costs for a gallon
$5.18 to $9.20

## Orphan times
Fill in `orphan-endtimes.md` for a source of truth
edit `ORPHAN_ENDTIME_OVERRIDES` to factor in manual end times that aren't generated via email

## TODO
Send email audit log of csv
 

## Bugs
- google API returns last day of the prev month hours due to timezone
