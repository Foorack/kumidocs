# Kumidraw: A Coordinate-Explicit Diagram Format

**Status:** Draft (v1)
**Project:** KumiDocs

## Abstract

Kumidraw is a line-oriented, coordinate-explicit text format for static
diagrams. It is designed for cloud architecture diagrams (for example, AWS
infrastructure), but it is general enough for simple graphic composition:
filled boxes, icons, labels, and arrows.

Kumidraw specifies none of the following: automatic layout, automatic
alignment, connectivity semantics (lines are visual only), or runtime
behavior. Every element is placed at an explicit coordinate. The intended
authors are humans and AI assistants.

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" in this
document are to be interpreted as described in [RFC 2119].

---

## 1. Introduction

The format is deliberately small. There are three drawing statements: `box`,
`line`, and `text`. A file is parsed from top to bottom. Each statement is
independent. There are no `title` or `grid` statements: the filename is the
title, and the grid is always 10.

### 1.1. Design Goals

The format is designed to be:

1. Easy to write by a human.
2. Easy to read and generate by an AI.
3. Easy to parse in a single top-to-bottom pass.
4. Deterministic. No automatic layout and no automatic alignment.

### 1.2. Non-Goals

The format does NOT specify:

- automatic layout,
- automatic alignment,
- connectivity semantics (a line does not connect things; it is visual only),
- any runtime behavior.

---

## 2. Terminology

| Term  | Definition                                                   |
| ----- | ------------------------------------------------------------ |
| File  | The whole Kumidraw source text.                              |
| Line  | A single statement in the source, delimited by a line break. |
| Point | A pair `(x, y)` giving a position in the diagram.            |
| Box   | A rectangular element with a width and a height.             |
| Icon  | A named graphic from a registered icon set.                  |
| Grid  | A fixed spacing of 10 that the editor uses for snapping.     |

The term "Group" is intentionally not defined. A group is just a box with a
dashed outline and a label. It has no containment meaning.

---

## 3. File Structure

A Kumidraw file is a sequence of statements. One statement is one line.

### 3.1. Parsing Model

The file is parsed from top to bottom. Each statement is independent. No
statement depends on any other statement.

Indentation (leading whitespace) is not significant. A parser MUST strip
leading whitespace from each line before parsing. Indentation is permitted so
that a human can group related lines visually, but it never carries meaning.

The following two files are equivalent:

```
box (40, 40) (1800, 1000) dashed "AWS Region"
box (90, 160) (800, 500) fill "Availability Zone A"
box (120, 280) (300, 100) :nginx "Web"
```

```
box (40, 40) (1800, 1000) dashed "AWS Region"
  box (90, 160) (800, 500) fill "Availability Zone A"
    box (120, 280) (300, 100) :nginx "Web"
```

### 3.2. Characters and Encoding

- The file MUST be UTF-8.
- A line break MAY be LF or CRLF.
- A line SHOULD NOT exceed 200 characters.
- Trailing whitespace on a line is ignored.

### 3.3. Comments

A line whose first non-whitespace character is `#` (U+0023) is a comment.
The parser MUST ignore it.

The only exception is the header line (Section 4), which is a line that
begins with `# kumidraw`.

Example:

```
# this line is a comment
```

### 3.4. Blank Lines

A blank line MUST be ignored.

---

## 4. Version and Settings

The first line of a valid file MUST be the header line:

```
# kumidraw v:1 grid:10
```

The header line holds the format version and the diagram settings. It uses
key-value pairs separated by spaces.

- `v:N` is the format version. The current version is `1`.
- `grid:N` is the grid spacing. The only valid value is `10`.

A parser MUST reject a file whose header line is missing, or whose version
is unknown.

A parser MUST ignore settings it does not recognize. This allows future
versions of the reader to add new settings without breaking older files.
The `v` key is always required.

A file has at most one header line, and it MUST be the first line.

---

## 5. Statements

Each statement uses the token grammar defined in Section 8. Throughout this
section, `SP` means one or more spaces or tabs.

### 5.1. Coordinate and Size Notation

A coordinate is `(x, y)`, where:

- `x` is a non-negative integer,
- `y` is a non-negative integer.

A size is `(w, h)`, where:

- `w` is a positive integer,
- `h` is a positive integer.

Within a coordinate or size, the comma and surrounding spaces are optional.
`(x,y)` and `(x, y)` are both valid.

### 5.2. The `box` Statement

```
box (x, y) (w, h) [DECORATIONS]
```

The `box` statement draws a rectangle.

- `(x, y)` is the position of the top-left corner.
- `(w, h)` is the width and height.
- `[DECORATIONS]` is zero or more decorations, in any valid order.

The valid decorations are:

| Decoration | Form      | Meaning                                          |
| ---------- | --------- | ------------------------------------------------ |
| Border     | `border`  | Draw the box as an outline. This is the default. |
| Fill       | `fill`    | Draw the box as a solid filled block.            |
| Dashed     | `dashed`  | (Border mode) Draw the outline dashed.           |
| Color      | `#RRGGBB` | Border color, or fill color when `fill`.         |
| Icon       | `:NAME`   | Draw the named icon in the box.                  |
| Label      | `"TEXT"`  | Draw the text label in or near the box.          |

#### 5.2.0. Token Disambiguation

Every token in a `box` statement is recognizable by its first character. A
parser MUST identify tokens by these rules, in order:

| First char | Token class           | Example      |
| ---------- | --------------------- | ------------ |
| `(`        | geometry (point/size) | `(110, 110)` |
| `#`        | color                 | `#3498db`    |
| `:`        | icon name             | `:home`      |
| `"`        | label text            | `"Web"`      |
| letter     | keyword               | `border`     |

Because each class is identified by its first character, there is no
ambiguity between an icon name and a keyword. An icon MUST begin with `:`.

#### 5.2.0a. Icon Names

An icon reference is always a bare name:

```text
:NAME
```

An icon name is resolved against a registered icon set. The format does not
define which packs or sets a renderer uses. A renderer MAY resolve an icon
name to any registered source, and the mapping MAY change over time without
changing the file.

If an icon name does not resolve to a known icon, the renderer draws a
fallback symbol in its place. The fallback MUST be plainly visible and
visually distinct from every valid icon, so a missing icon is obvious. A
renderer MAY also report a warning for diagnostics.

#### 5.2.1. Border and Fill

A box is drawn one of two ways, never both:

- `border` draws an outline with a transparent interior. This is the
  default when neither keyword is present.
- `fill` draws a solid filled block with no outline.

The two keywords are exclusive; the last one written wins. There is no
`noborder` and no way to have both an outline and a fill.

| Statement                     | Effect                          |
| ----------------------------- | ------------------------------- |
| `box (x, y) (w, h)`           | border (outline), default color |
| `box (x, y) (w, h) border`    | border (outline), default color |
| `box (x, y) (w, h) fill`      | fill, default fill color        |
| `box (x, y) (w, h) border #R` | border (outline) in color `#R`  |
| `box (x, y) (w, h) fill #R`   | fill in color `#R`              |
| `box (x, y) (w, h) dashed`    | dashed border (outline)         |

A single `#RRGGBB` color sets the border color in border mode, or the fill
color in fill mode. A fill color is a six-digit hex RGB value.

The `dashed` decoration applies only to border mode; it draws the outline
dashed. It has no effect in fill mode.

#### 5.2.2. Icon and Label Placement

The icon and the label always sit at the top-left of the box. There is no
placement configuration; a box has no anchor decoration.

- The icon sits in the top-left corner.
- The label sits to the right of the icon.

This matches the AWS reference architecture look, where a group has a small
icon and a label beside it in the corner.

An icon and a fill MAY both be present, and the icon draws on top of the fill.
An icon begins with `:` (see 5.2.0). A label is a quoted string. It MAY
contain spaces.

#### 5.2.3. Examples

```
# border (outline), default color
box (110, 110) (180, 80)

# border (outline), filled interior, icon and label top-left
box (110, 110) (180, 80) #3498db :gitlab "GitLab"

# fill (solid color block); icon and label top-left
box (60, 60) (400, 200) fill #e8f4fd :gitlab "Availability Zone A"

# dashed border (outline) for a group
box (40, 40) (1800, 1000) dashed "AWS Region"

# border (outline) as a label tag
box (110, 110) (180, 60) "subnet 1 10.0.0.0/24"
# an icon alone
box (110, 110) (180, 80) :nginx
```

### 5.3. The `line` Statement

```
line POINT (POINT ...) [STYLING]
```

The `line` statement draws a line through two or more points.

The statement has two parts: the points, always first; then the styling,
always last.

- The first point is the start. The last point is the end. Points in between
  are passed through in order.
- A line MUST have at least two points.
- All points MUST appear before any styling token. There is no `via`
  keyword; the points simply follow one after another.

The styling tokens, in any order:

| Token      | Meaning                                             |
| ---------- | --------------------------------------------------- |
| `dashed`   | Draw the line with a dashed stroke                  |
| `#RRGGBB`  | Draw the line in the given color                    |
| `ortho`    | right-angle segments; the renderer picks the bend   |
| `ortho-hv` | right-angle segments; bend Horizontal-then-Vertical |
| `ortho-vh` | right-angle segments; bend Vertical-then-Horizontal |
| `curve`    | smooth curved (Bezier) segments through the points  |
| `->`       | arrowhead at the end                                |
| `<-`       | arrowhead at the start                              |
| `<->`      | arrowhead at both ends                              |
| `"TEXT"`   | a label drawn near the middle of the line           |

Rules:

- Routing is optional. With no routing token, the line is straight.
  There is no `direct` keyword; straight is the default.
- The arrowhead is optional. With no arrowhead token, the line has no
  arrowhead.
- The label is optional.
- The stroke is solid by default. With the `dashed` token, it is dashed.
- The stroke is a single default color by default. With a `#RRGGBB` token,
  it is that color. The arrowheads, when present, draw in the same color as
  the line.
- The parser reads points while a token starts with `(`, then reads styling
  for the rest of the line. A token that starts with `(` after styling is an
  error.
- `ortho` bends every segment at a right angle. `ortho-hv` and `ortho-vh`
  force the bend direction.
- `curve` draws a smooth path through every point in order. The exact curve
  is a renderer choice, but it MUST pass through every point.

Examples:

```
# a straight line (two points)
line (200, 190) (840, 150)

# a straight line with an arrowhead at the end
line (200, 190) (840, 150) ->

# a straight polyline through three points
line (200, 190) (400, 300) (840, 150)

# an elbow line
line (200, 190) (840, 150) ortho

# a dashed, red arrow
line (200, 190) (840, 150) dashed #e74c3c ->

# an elbow line, Horizontal-then-Vertical forced, with a label
line (200, 190) (400, 300) (840, 150) ortho-hv "route"

# a curved line with arrowheads at both ends
line (200, 190) (840, 150) curve <->

# a dashed, green curved arrow
line (200, 190) (840, 150) curve #2ecc71 dashed <->

# an elbow polyline with an arrowhead
line (200, 190) (400, 300) (600, 100) (840, 150) ortho ->
```

### 5.4. The `text` Statement

```
text (x, y) "TEXT"
```

The `text` statement draws free-floating text.

- `(x, y)` is the position of the text's top-left corner.
- `TEXT` is the text to draw.

There is no maximum number of `text` statements.

---

## 6. Grid and Snapping

### 6.1. Grid Spacing

The grid is a helper for keeping positions tidy and for snapping in the
editor. The grid spacing is always 10. It is set in the header line
(Section 4) and never changes.

The grid NEVER affects rendering. It NEVER affects parsing. It is only a
convention for editors and authors.

### 6.2. Off-Grid Coordinates

The parser accepts any non-negative integer coordinate. A coordinate is not
required to be a multiple of 10; `box (117, 92)` is valid. The renderer MUST
draw every element at its exact given coordinates and MUST NOT snap, round,
or move any element to a grid point.

### 6.3. Editor Snapping

An editor that supports dragging SHOULD snap element positions to the grid.

The snapping rule: round each coordinate to the nearest multiple of 10.
Round half up.

```
snapped = round(value / 10) * 10
```

The `round` function rounds a fractional part of `0.5` or more up.

Snapping applies ONLY when the user is dragging an element. It MUST NOT
change existing coordinates that were typed by hand or by an AI.

### 6.4. Writing

When a tool writes a Kumidraw file, it SHOULD write coordinates that are
multiples of 10. This keeps the file tidy and makes diffs easier to read.

---

## 7. Rendering Rules

This section gives the default visual behavior. A renderer MAY apply themes
that change colors, fonts, or border styles, but it MUST NOT move elements.

### 7.1. Coordinate Space

- The origin `(0, 0)` is the top-left of the diagram.
- The `x` axis increases to the right.
- The `y` axis increases toward the bottom.
- One unit is one abstract point. The renderer MAY scale these to screen
  pixels.

### 7.2. Boxes

- A box is drawn one of two ways: as an outline (border mode, the default)
  or as a solid block (fill mode). The two are exclusive.
- In border mode, the box draws an outline with a transparent interior. The
  outline is solid by default, dashed if the `dashed` decoration is present.
- Border thickness is fixed at 2px. The format does not allow any other
  border thickness, and boxes never have rounded corners.
- In fill mode, the box draws a solid block with no outline.
- A single `#RRGGBB` color colors the border in border mode, or the interior
  in fill mode.
- If an icon is present, it is drawn in the top-left corner.
- If a label is present, it is drawn to the right of the icon. Placement
  (inside vs. below) is a renderer choice.

Note: an icon and a label are never centered in a box. Placement is always
top-left (Section 5.2.2).

### 7.3. Lines

- With no routing token, a line draws straight segments between consecutive
  points.
- An `ortho` line draws horizontal and vertical segments between consecutive
  points.
- `ortho-hv` forces each segment to draw Horizontal-then-Vertical.
- `ortho-vh` forces each segment to draw Vertical-then-Horizontal.
- A `curve` line draws a smooth curved path through the points in order. The
  path MUST pass through every point.
- Segments run point-to-point in order.
- Arrowheads follow the arrowhead token (`->`, `<-`, `<->`).
- A line with no arrowhead token is a plain line. It is the same statement
  type.
- The stroke is solid by default, dashed if the `dashed` token is present.
- The stroke and arrowheads use the `#RRGGBB` color if present; otherwise they
  use the renderer's default line color.
- Line thickness is fixed at 2px.

### 7.4. Text

- A free text element is drawn at its given position.
- A line's quoted label is drawn near the middle of the line. The renderer
  picks the exact offset.

### 7.5. Rendering Order

The renderer SHOULD draw in source order:

1. Boxes, in the order they appear.
2. Lines, in the order they appear.
3. Text, in the order they appear.

A later element draws on top of an earlier element.

---

## 8. Grammar (Normative)

This section is the normative grammar, written in ABNF as defined in
[RFC 5234].

Leading whitespace on any line is stripped before parsing. It is never
significant. A line is then matched against one of the statement rules.

```
kumidraw-file = header *line
header        = %s"# kumidraw" SP "v:" digit SP "grid:" "10" CRLF
line          = statement / comment / blank

statement     = box / line-stmt / text-stmt
comment       = "%x23" *VCHAR        ; any line starting with # except header
blank         = *WSP

box           = "box" SP point SP size *(SP box-decoration)
box-decoration= "border" / "fill" / "dashed" / hex-color / icon / quoted

line-stmt     = "line" SP point *(SP point) *(SP line-style)
line-style    = "dashed" / hex-color / "ortho" / "ortho-hv" / "ortho-vh" / "curve" / "->" / "<-" / "<->" / quoted

text-stmt     = "text" SP point SP quoted

point         = "(" integer "," integer ")"
size          = "(" 1*DIGIT "," 1*DIGIT ")"
integer       = 1*DIGIT              ; non-negative decimal
hex-color     = "#" 6HEXDIG
quoted        = DQUOTE *(VCHAR / WSP) DQUOTE
icon          = ":" 1*(ALPHA / DIGIT / "-" / "_")

; SP is one or more WSP
SP            = 1*WSP
```

### 8.1. Notes on the Grammar

- A `line` MUST have at least two points: a start and an end. Points in
  between are passed through in order.
- A `box` and a `line` MUST have at most one of each decoration or style
  token. Repeating a routing token, an arrowhead token, a fill color, an
  icon, or a label is an error.
- The grammar is unambiguous: any valid line matches exactly one statement
  rule, and within a statement each token belongs to exactly one class.

---

## 9. Example

The following is a complete, valid file. (The filename is the title, so the
file carries no title.)

```
# kumidraw v:1 grid:10

# the network cage: dashed border, light fill, text top-left
box (40, 40) (1800, 1000) dashed #ff0000 "Production VPC"

# filled nodes with icons and labels top-left
box (110, 110) (180, 80) #3498db :nginx "Web"
box (330, 110) (180, 80) #3498db :gitlab "GitLab"
box (840, 110) (180, 80) #2ecc71 :docker "Docker"

# a color band: fill, icon and label top-left
box (90, 260) (600, 200) fill #e1ff00 :kubernetes "Availability Zone A"

# a label tag: border
box (110, 320) (260, 60) "subnet 1 10.0.0.0/24"

# an elbow arrow with a label
line (200, 190) (840, 150) ortho "deploys"

# a straight polyline through three points
line (330, 190) (400, 300) (600, 100) (1100, 150)

# a straight polyline with an arrowhead
line (840, 250) (900, 300) (1100, 250) ->

text (840, 350) "Served over HTTPS"
```

---

## 10. Security Considerations

Kumidraw is a rendering-only format. It defines no execution semantics.

A renderer MUST treat the content of `text` and box labels as data. If a
renderer renders to HTML, it MUST escape such text before insertion to
avoid injection. Icon names are taken from a fixed registry and MUST NOT be
interpreted as code or paths. A renderer MUST NOT load icon files by
arbitrary name; an unknown icon name draws the fallback symbol (Section
5.2.0a) and MUST NOT be treated as code.
