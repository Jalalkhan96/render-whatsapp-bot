# InfoScrap

Centralized finance, weather, alert, and news scrapers used by:

- `.finmenu` and `.finance`
- `.weatherinfo CITY`
- `.alert TYPE [CITY]`
- `.paknews [province|district|breaking|weather|flood|earthquake]`

Currency rates use the public ExchangeRate API. News and alerts use Google
News RSS and USGS earthquake feeds. Current weather and forecasts use
`wttr.in`. Gold, silver, petrol, and diesel prices are read from the
configured Pakistan market pages and are returned as source links when a page
changes format. No user query or API secret is stored.
