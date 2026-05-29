# Markdown Screenplay Syntax Basics

## Scene transitions

Use `:` to mark scene transitions.

```
: CUT TO
```

## Scene headings

Use `#` to mark scene headings. This is similar to markdown headings.

```
# INT. KITCHEN – NIGHT
```

To reference a sub heading you can use `##`.

A sub scene is still a scene heading, but it is treated as a continuation of the active scene and should not increment the main scene count in the same way.
This helps if you need to convey camera changes or going between interior and exterior at the same location.

## Dialogue

Use `>` to start a character name line and `>>` for dialogue and paraentheicals.

```
> MORGAN
>> We need to leave now.
```

## Parentheticals

Use `>> ( )` to mark parentheticals.

```
> MORGAN
>> (quietly)
>> I don't think it heard us.
```

## Scene Descriptors

The absence of any special markdown character will denote scene descriptions and tellings of actions within it.
