# Markdown Screenplay Syntax Basics

## Scene transitions

Use `: ` to mark scene transitions.

```
: CUT TO
```

## Scene headings

Use `# ` to mark scene headings. This is similar to markdown headings.

```
# INT. KITCHEN – NIGHT
```

To reference a sub heading you can use `## `.

A sub scene is still a scene heading, but it is treated as a continuation of the active scene and should not increment the main scene count in the same way.
This helps if you need to convey camera changes or going between interior and exterior at the same location.

## Dialogue

A dialogue can be initialized by starting with an `@` to reference a character.
The following lines will detail the spoken the lines of dialog or parenthicals the character must perform.

```
@ MORGAN
We need to leave now.
```

## Parentheticals

Use `( )` to mark parentheticals.

```
@ MORGAN
(quietly)
I don't think it heard us.
```

## Scene Actions

The absence of any special markdown character will denote scene description/action.

## Blank Lines

These are used to sepeate out the scene syntax types and required for interpetation.
