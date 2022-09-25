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
const MAX_PRICE = MAX_KWH * PEAK_PRICE // 4.928
const MIN_PRICE = MAX_KWH * OFF_PEAK_PRICE // 2.2
```

Assuming 34 mpg, min/max ev costs for a gallon
$4.40 to $9.60
 

## Bugs
- google API returns last day of the prev month hours due to timezone
