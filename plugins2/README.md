# PP safe-comics commands

The PP menu now exposes safe comics only. Adult video/gallery commands and aliases have been removed and are blocked centrally for all users, including primary and secondary owners.

## Commands

| Command | Function |
|---|---|
| `-ppmenu` | Open the safe comics slider menu |
| `-ppwebtoon <search or series URL>` | Search/open a WEBTOON series |
| `-ppwebtoonget <episode URL> [full]` | Download WEBTOON episode pages as PDF batches |
| `-pptapas <series URL>` | Open a Tapas series |
| `-pptapasget <episode URL> [full]` | Download Tapas episode pages as PDF batches |
| `-ppsites` / `-pplist` | List the two supported safe comic providers |
| `-pptest <site>` / `-ppcheck <site>` | Check a supported provider's home page |
| `-ppstatus` | View the safe PP layer status |

Only WEBTOON and Tapas are registered in the PP site registry. Adult media handlers are not registered; the central command policy also rejects legacy command names, adult-site URLs, and adult site selectors.

For removal of dormant source packages, run `bash scripts/remove-adult-features.sh` from the ABIX bot root, then restart both transports.
