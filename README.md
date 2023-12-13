<br />
<div align="center">

  <img src="https://i.imgur.com/0SR2KVb.png" width="256" height="256"/>

  <h3 align="center" style="margin-bottom: 0;">LAUX - GLUA Transpiler</h3>
  <sup>( LAUX )</sup>
  <p align="center">
    This is a fork of LAU made by <a href="https://github.com/alexanderarvidsson" target="_blank">Metamist (Alexander Arvidsson)</a>
    LAU as a project is dead. This fork is an attempt to revitalize Metamist's project, with a few changes to syntax & functionality.
    <br />
    <br />
    <a href="https://github.com/8char/laux-compiler/issues">Report Bug</a>
    ·
    <a href="https://github.com/8char/laux-compiler/issues">Request Feature</a>
  </p>
</div>

# What is LAUX?

LAUX is a superset of Lua, adding syntax sugar on top of Lua. It does however still work with vanilla Lua.

# How to use

You will need to install [Node.js](https://nodejs.org) to use this.

Open up a terminal of your choice, and type this.

```bash
> npm i -g laux-compiler
```

To transpile you simply go to the folder your project belongs to

```bash
> lauxc watch ./laux ./lua
```

## Workspaces

There's also an option to use workspaces, which simply means using a configuration file. The config file must be `lauxconfig.json` and be located in the root folder.

This allows you to use a lot more options, of which one of the interesting ones is merges. You can merge multiple files into 1 single output file, which is very useful for releases.

An example of a config file would be this.

```json
{
  "path": {
    "input": "./laux",
    "output": "./lua"
  },
  "merges": [
    {
      "filesGlob": ["atlas_jobcreator/fields/**/*.laux"],
      "output": "atlas_jobcreator/fields"
    },
    {
      "filesGlob": ["atlas_jobcreator/currencies/**/*.laux"],
      "output": "atlas_jobcreator/currencies"
    }
  ]
}
```

To actually use the merge features, you would have to use the release option, which is denoted as -r

### No options

```bash
> lauxc workspace
```

### Release that merges files

```bash
> lauxc workspace -r
```

# What does it add?

## Functions

LAUX adds fat arrows & thin arrows.

Example of fat arrow

```lua
local Foo = {}
Foo.Bar = (self) => print(self) end -- Foo.Bar = function(self) print(self) end
```

Example of thin arrow doing the same

```lua
local Foo = {}
Foo.Bar = () -> print(self) end -- Foo.Bar = function(self) print(self) end
```

Thin arrow is essentially just a fat arrow, but it automatically adds self, just like: adds self automatically in contrast to <code>.</code> in default Lua.

## Decorators

LAUX adds decorators which can mutate functions to allow for things such as deprecation, singeltons, registries, mixin functionality, memoization, validation, rate limiting, caching, authentication/authorization, logging, etc...
_You can currently only have one decorator per _function, however, you can_ combine them into one larger decorator_

```lua
-- These deprecated functions can be defined in
-- your library & be imported using LAUX's
-- import statement
local function deprecated(func)
  return function(...)
    local name = nil
    local index = 1

    while true do
        local info = debug.getinfo(func, "S")
        if not info then
            break
        end

        if info.what == "Lua" and info.name then
            name = info.name
            break
        end

        func = debug.getupvalue(func, index)
        if not func then
            break
        end

        index = index + 1
    end

    MsgC(Color(255, 165, 0), "[WARN] The function " .. name .. " is deprecated. Please look to using alternatives as this will cease to exist!")
    func(...)
  end
end

-- Imagine we have this TestFunc that comes from SomeLibrary,
-- we want to warn users upon each use so that they use
-- something different
@deprecated
function PrintPlayerName(ply)
  print(ply:Nick())
end
```

## Types

**This is real-time type checking, so don't run it in something that gets run A TON, like every frame**
_Currently doesn't work with arrow functions, fixing later_

```lua
function Foo(bar: string)
  -- do nothing
end
```

Outputs to

```lua
function Foo(bar)
  local __lau_type = (istable(bar) and bar.__type and bar:__type()) or type(bar)
  assert(__lau_type == "string", "Expected parameter `bar` to be type `string` instead of `" .. __lau_type .. "`")
end
```

This also accepts multiple types by using the | (pipe) character

```lua
function Foo(bar: string|MyAddon.Bar)
  -- do nothing
end
```

Outputs to

```lua
function Foo(bar)
  local __lau_type = (istable(bar) and bar.__type and bar:__type()) or type(bar)
  assert(__lau_type == "string" or __lau_type == "MyAddon.Bar", "Expected parameter `bar` to be type `string|MyAddon.Bar` instead of `" .. __lau_type .. "`")
end
```

## Mutations

LAUX adds mutations. Those are just simple shortcuts

```lua
x += 5 -- x = x + 5
x *= 2 -- x = x * 2
x /= 2 -- x = x / 2
x++ -- x = x + 1
x -= 1 -- x = x - 1. Notice x-- doesn't exist
x ||= 2 -- x = x or 2
x ..= "me" -- x = x .. "me"
x %= 2 -- x = x % 2
```

## Shortcut Expressions

LAUX adds shortcuts for quickly doing a generic action.

```lua
stopif i > 5 -- if (i > 5) then return end
breakif i > 2 -- if (i > 2) then break end
continueif i > 8 -- if (i > 8) then continue end
```

## Classes

LAUX adds JavaScript-like classes. I assume you already know what a class is.

Syntax

```lua
[public] Class name [extends Parent] end
```

Example

```lua
class Foo
  -- We can have static attributes
  static ENUMS = {}
  -- We can also non static attributes
  name = "Bar"

  constructor(foobar: string)
    self.foobar = foobar
  end

  setFoobar(val: string) self.foobar = val end
  getFoobar() return self.foobar end

  -- If we are not using a public class we need to add __type() function.
  -- This is to avoid overlapping names for type checking
  __type()
    return "MyAddon.Foo"
  end
end

-- Don't need new keyword.
local foo1 = Foo()
```

Now if we wish, we can extend it

```lua
class Bar extends Foo
  constructor(foobar)
    -- Because we're extending we need to use super()
    -- You need to pass the arguments your parent (extends) need
    super(foobar)

    -- Lets now get our name we got from Foo
    print(self.name)
  end

  -- Only on Bar, not Foo
  uniqueMethod() end
end
```

Classes by default are private, so we can make it public by using the public keyword

```lua
public class AtlasShop.Items.Health extends AtlasShop.Item
  -- Since this is a public class you don't need a type
  -- __type will automatically return the name of the class
end
```

<blockquote>

[!IMPORTANT]
A class can implicitly define a default constructor.
But, when inheriting from a default constructor class you must create a constructor to call `super()` **if you define a field**, it isn't done implicitly.
```lua
class Foo
  var = 5
end

class Bar extends Foo

end

local b = Bar()
```

This will create an error. To fix it create a constructor.

```lua
class Foo
  var = 5
end

class Bar extends Foo
  constructor()
    super()
  end
end

local b = Bar()
```


</blockquote>



### Getters and Setters

Laux has syntactic sugar for getters and setters. By using `_get` and/or `_set`.

```lua
class Foo
  _get _set variable
  _get secondVariable
end
```
The resulting lua corresponding to the methods is
```lua
setVariable = function(self, variable)
    self.variable = variable
    return self
end,
getVariable = function(self)
    return self.variable
end,
getSecondVariable = function(self)
    return self.secondVariable
end,
```



## Safe member navigator

LAUX adds a safe member navigator. This allows you to index something in a table without having to check if an element exists.

LAUX code

```lua
if (groups?[groupKind]?.members?.name) then

end
```

Lua code

```lua
if (((groups and groups[groupKind]) and groups[groupKind].members) and groups[groupKind].members.name) then

end
```

## Import Statement

The import statement allows for the importing of members of an object. The import statement itself doesn't transpile down into anything, however, what it does is it adds the parent object before each index of it in code. Here's an example:

```lua
import print, warn, log from AtlasUI

print("Hello there!")
warn("Hello there!")
log("Hello there!")
```

Will transpile down to:

```lua
AtlasUI.print("Hello there!")
AtlasUI.warn("Hello there!")
AtlasUI.log("Hello there!")
```

## Spread operator

This is the same operator found in JavaScript. It functions like `table.concat`/`table.unpack`.

```lua
local a = { 2, 3 }
local b = { 1, ...a, 4 }
PrintTable(b) -- { 1, 2, 3, 4 }
```

## Deconstructing

Same as in JavaScript.

```lua
local tbl = { a = 5, b = 3 }
local { a, b } = tbl -- local a, b = tbl.a, tbl.b
print(a) -- 5
print(b) -- 3
```

## For of statement

You can do a generic for loop, which is the equivalent of doing

```lua
for i, v in pairs(tbl) do

end
```

By doing this in LAUX

```lua
for i, v of tbl do

end
```

*There is no ipairs equivalent of this.*

## Formated string

You can make a formated string by using the <code>`</code> character and enclosing your variable names in braces :

```lua
print(string.format("there are %d %s", number, string)
```

By doing this in LAUX

```lua
print(`there are ${number} ${string}`)
```
