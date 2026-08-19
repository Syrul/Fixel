# The judge prompt

Every duel judge gets **this exact text**, with only the directory path
substituted. Rounds are only comparable if the wording is.

## Rules for dispatching a judge

- **One fresh agent per pair, per order.** Never batch pairs into one judge.
  Round c0 proved why: a judge shown several pairs spotted that the reference
  crops shared overlapping content and identified the common source without
  judging craft at all.
- The judge must have no project context. It is not told Fixel exists, that
  anything is generated, or that one side is a reference.
- The judge must never be given `out/.keys/`, `tools/`, or `src/`.
- Both orders must be run by **different** agents, not the same agent twice.

---

## v1 — used for round r1. RETIRED. Read why before reusing it.

The v1 criteria list opened with:

> - density: how much of the area is doing work, and how much is filler

**That line lost round r1 its meaning.** Judges read "filler" as "flat area" and
"doing work" as "varies per pixel", and then ranked on exactly the axis our
measurements say is our worst defect. Two independent r1 judges picked Fixel
over the reference *with confidence*, and both gave essentially the same reason:

> "B's median 16x16 tile holds 16 unique colours against A's 8"
> "16.0% of A's area is dead filler — 256 of its 1600 8x8 tiles contain two
>  colours or fewer"

`colorsPerTile.median16` = 16 against a reference band of [7, 9] is Fixel's
**worst single metric at +3.50 bandwidths**. The judges rewarded it. And the
"dead filler" they penalised is the reference's flat-interior craft — the 5x5
flatness that `docs/BAR.md` calls the one number separating real pixel art from
everything pretending, and which a downsampled 3D render or a diffusion image
scores 0-2% on.

A judge that prefers per-pixel variation to flat facets will always pick
confetti. The brief has to say so explicitly, because "density" alone does not.

---

## v2 — current

> You are judging pixel-art craft. You have no other context and you should not
> seek any: do not read source code, do not list any directory other than the
> one named below, and do not open any file that is not one of the two images.
> If you go looking for where these came from you invalidate the judgement.
>
> **Work only in `<SCRATCH>`.** That directory is yours alone. Do not write
> anywhere else, and do not read any working file you did not create there.
> Other judges are running at the same time on the same two filenames; in a
> previous round one judge's working crops were silently overwritten by
> another's and it very nearly ranked pixels that were not its own.
>
> **Before you look at anything, verify your inputs.** `<DIR>/CHECKSUMS.txt`
> holds the sha256 of both images. Compute both hashes yourself and confirm
> they match. Do it again before you report. If either hash disagrees, STOP and
> report the mismatch instead of a ranking.
>
> Open both images in `<DIR>` with the Read tool: `A.png` and `B.png`. Look at
> them. You may magnify them with nearest-neighbour only (no smoothing, no
> resampling) to inspect edges, and you may compute statistics over the pixels.
> Write any working files into `<SCRATCH>`.
>
> **File structure is not evidence.** Both files are padded to exactly the same
> byte length with a private chunk, so file sizes, chunk sizes and compressed
> stream lengths tell you nothing about origin. A previous judge worked this
> out from the PNG structure rather than the picture; that is not craft, and
> the padding is now symmetric specifically so it cannot be used. Judge pixels.
>
> Both are 320x320, 8-bit RGBA PNG, non-interlaced, native 1:1 scale. Each is an
> unscaled crop from the interior of a larger isometric pixel-art scene. Neither
> is a complete composition and neither is centred on a subject.
>
> Judge **craft, not subject.** Do not reward an image for depicting a more
> appealing, more legible or more familiar thing, and ignore the content of any
> sign or lettering.
>
> **Before you rank, read these three cautions. They exist because previous
> judges got this comparison backwards.**
>
> 1. **Flat areas are not automatically filler.** In good pixel art, solid
>    objects have large flat interiors and the picture's complexity comes from
>    how many separately-drawn objects are packed in, not from how much each
>    surface varies. A crop where roughly a third of pixels sit in a completely
>    flat 5x5 neighbourhood can be excellent. Ask whether a flat area is a
>    *facet of a solid object* or an *unfilled gap*. Only the second is filler.
> 2. **More colours per tile is not better.** A tile holding 16 distinct
>    colours is usually worse than one holding 8. Scattered per-pixel colour
>    variation reads as noise; a committed local palette reads as material.
>    Judge whether colour is *localised to objects* or *sprayed uniformly*.
> 3. **Neither of these is the same as sparseness.** A crop with large empty
>    regions, repeated stamps, or nothing happening across whole bands is still
>    a failure. Dense-and-flat is the target; both dense-and-noisy and
>    sparse-and-flat are failures.
>
> Judge on:
>
> - **object density** — how many separately-formed things occupy the area
> - **colour discipline** — is colour committed per object, or scattered
> - **edge quality** — hard deliberate edges vs mush, noise or antialiasing
> - **outline and separation** — do adjacent objects read apart from each other
> - **form** — do volumes read as solids under one consistent light
> - **detail hierarchy** — is there small detail that survives close inspection,
>   sitting on larger calm areas rather than covering everything
> - **variety** — does the crop repeat itself, or is every region distinct
>
> Answer:
>
> 1. **Which is better made, A or B?** You must pick one. "Tie" is not allowed.
> 2. **Confidence:** `confident`, `slight`, or `coin flip`.
> 3. **The single strongest cue**, in one sentence.
> 4. **Does either look like it was made by a different process, tool or hand
>    than the other?** Yes/no, which, and why. "No" is a real answer.
> 5. **The biggest single defect in the weaker image, stated as a number** —
>    a count, a fraction, a proportion of the area. Not an adjective.
> 6. **Which image would you expect to have been produced by a program, and
>    which by a person?** Answer even if unsure, and say what decided it.

Question 6 is new in v2. It is not scored, but it is the most informative line a
judge produces, and r1's judges volunteered it unprompted in both directions.

## How a round is scored

A pair is a **WIN** only if the judge picks the Fixel crop in *both* orders,
judged by two different agents. Picking the reference in either order is a
**LOSS** for that pair, and a split verdict across the two orders is a LOSS and
a signal the pair was near chance.

The round is a win only if every pair is a win. Several pairs, not one —
**mixed means it lost**.

**A judge win with the numbers out of band is not a win.** r1 is the worked
example: two confident judge wins while scoring 17/60 against the band, versus
60/60 for the reference and 31/60 for the second-opinion Pixorama. When the
judge and the band disagree, the band is the one that was calibrated against
four files and a set of synthetic cheats. Fix the brief, re-run, and do not
bank the win.
