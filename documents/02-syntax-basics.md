# Markdown Screenplay Syntax Basics

## Scene transitions

Use `:` to mark scene transitions.

Example:

```
: CUT TO:
```

## Scene headings

Use `@` to mark scene headings.

```
@ INT. KITCHEN – NIGHT
```

To not change scenes you can use `@@` to mark as a sub scene heading.

A sub scene is still a scene heading, but it is treated as a continuation of the active scene and should not increment the main scene count in the same way.

## Dialogue

Use `>` to start a character name line and `>>` for dialogue lines.

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
