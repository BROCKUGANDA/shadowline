# SHADOWLINE — "Ten hertz of truth" demo film SPEC (v1)

## Frame & length
1920×1080, 30 fps, 48 s total. 1920×1080 MP4 (H.264, yuv420p, AAC 48 kHz).
End card holds 2.5 s. Music: generated sub-pulse ambience + chimes (ffmpeg synthesis), ducked ~8 dB under VO.
VO (2026-11-14): Kokoro-82M `am_michael`, en-US, normal pace; one line per beat, written to beat:
hook 0.4s · tension 4.0s · reveal 7.3s · dataset 9.8s · drills 14.4s · mri 19.4s · coverage 24.4s · verdict 29.4s · payoff 35.8s · end 41.0s.
Script in `assets/audio/vo-script.txt`; lines live in `assets/audio/vo/*.wav`.

## One thing
"SHADOWLINE measured whether 10 Hz Combine tracking predicts NFL coverage performance — honestly."
The viewer should remember: the platform ships the real answer, including a null.

## Beats (timings)
| t | Beat | Screen |
|---|------|--------|
| 0.0–3.5 | Hook | Question types: "CAN A STOPWATCH SEE 10 HERTZ OF TRUTH?" (kinetic type) |
| 3.5–6.0 | Tension | Traditional stopwatch/agility numbers scatter; screen: "The Combine times everything. Measures almost nothing." |
| 6.0–8.5 | Reveal | Logo lockup + tagline "Combine-to-Game Movement Intelligence" |
| 8.5–13 | Dataset | Real captured landing/status: 9/9 files, 2.20 GiB, SHA-256 verified, 510 players / 1,002 games / 22.6M tracking rows (labeled from real /api + audit artifacts) |
| 13–18 | Combine drills | Captured app: Combine Drill Explorer — 10 Hz trail draw |
| 18–24 | MRI | Captured app: Movement Intelligence — MRI components (dec/re-acc/orient), composite |
| 24–30 | Coverage | Captured app: Coverage Analysis — mean separation @ pass-forward |
| 30–36 | The verdict | Captured app: Research Audit — rho = +0.230 (perm p = 0.322; 95% CI [-0.291, +0.737]); OOS Δ(B−A) = -0.320 |
| 36–41 | Payoff | Big type: "The null is the result." + honest line: pre-registered decision rule not met |
| 41–48 | End card | Logo carries in, "SHADOWLINE", CTA: shadowline.aiazimara.com + "NFL Big Data Bowl 2027" |

## On-screen copy rules
Max 6 words/line, one line per moment, mono numerals. No claims beyond: 9/9, 510 players, 1,002 games (816 REG), 22.6M tracking rows, 327,019 player_play rows, rho=+0.230, p=0.322 (CI [-0.291,+0.737]), notebook rho = -0.151 (p=0.490), OOS A=0.194/B=-0.126. Label every chart with source artifact (e.g. "artifacts/v1/coverage_summary.json").

## Source of truth
Live demo at https://shadowline.aiazimara.com (login demo@shadowline.io). Captures via Playwright @ 1920×1080 deviceScaleFactor 2.

## BANNED (this film)
Logo docked in a corner; gradient-hero backdrop; feature-grid "three cards"; inventing UI; third-party logos; phone frames; mock browser chrome (real captures only); "unlock/seamless/supercharge/game-changer"; fake charts not sourced from pipeline output (charts must be re-drawn from the real numbers above, styled to brand).

## Look
Ground #060b09; panel #0e1712; stroke #17322300-ish; emerald #34d399 primary accent; off-white #f4f1e8; muted #8aa596; red #f87171 only for the null; JetBrains Mono for data; Inter for titles. Brand mark = SHADOWLINE ball (rugby) motif.
