# BillScrap

`billscrap/` contains the provider catalogue and adapters used by the bot's
`.billscrap` and `.bill` commands.

## Bot flow

1. Send `.billscrap` to see electricity and gas providers.
2. For PITC electricity companies, send:
   `.bill LESCO 14_DIGIT_REFERENCE_NUMBER`
3. Supported automatic PITC lookups are `PESCO`, `IESCO`, `LESCO`, `MEPCO`,
   `FESCO`, `GEPCO`, `HESCO`, `SEPCO`, `QESCO`, and `TESCO`.
4. For `HAZECO`, `K_ELECTRIC`, `SNGPL`, and `SSGC`, the bot returns the
   official portal link. These portals use different account forms, OTPs, or
   anti-bot controls and are not silently bypassed.

Examples:

```text
.billscrap
.bill IESCO 12345678901234
.bill LESCO 12345678901234
.bill SNGPL 123456789
```

The bot does not store the supplied reference number. A failed lookup should
be retried from the official portal because providers can require CAPTCHA,
consumer-ID formats, or temporary sessions.
