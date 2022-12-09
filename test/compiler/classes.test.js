import chai from "chai";
import chaiSubset from "chai-subset";
import compiler from "../../src/compiler";
import parser from "../../src/parser";
import CodeGenerator from "../../src/codegenerator";

chai.use(chaiSubset);

let {expect} = chai;

function parseCode(code) {
  const ast = parser.parse(code)
  const compiledAST = compiler.compile(
    JSON.parse(JSON.stringify(ast)), {
      debug: false
    }
  )
  const result = new CodeGenerator(code, compiledAST)
    .generate().code;

  return result;
}


export default {
  class: function() {
    expect(
      parseCode(`
        class Test
          __type() 
            return "Test" 
          end
        end`
      )
    ).to.equal(`local Test
do
  local _class_0
  local _base_0 = {
    __name = "Test",
    __type = function(self)
      return "Test"
    end
  }
  _base_0.__index = _base_0
  _class_0 = setmetatable({
    __init = function(self) end,
    __base = _base_0
  }, {
    __index = _base_0,
    __call = function(cls, ...)
      local _self_0 = setmetatable({}, _base_0)
      cls.__init(_self_0, ...)
      return _self_0
    end
  })
  Test = _class_0
end
`)
  },
  setter: function() {
    expect(
      parseCode(`
        class Test
          _set id

          __type() 
            return "Test" 
          end
        end
      `)
    ).to.equal(`local Test
do
  local _class_0
  local _base_0 = {
    __name = "Test",
    setId = function(self, id)
      self.id = id
      return self
    end,
    __type = function(self)
      return "Test"
    end
  }
  _base_0.__index = _base_0
  _class_0 = setmetatable({
    __init = function(self) end,
    __base = _base_0
  }, {
    __index = _base_0,
    __call = function(cls, ...)
      local _self_0 = setmetatable({}, _base_0)
      cls.__init(_self_0, ...)
      return _self_0
    end
  })
  Test = _class_0
end
`)
  },
  getter: function() {
    expect(
      parseCode(`
        class Test
          _get id

          __type() 
            return "Test" 
          end
        end
      `)
    ).to.equal(`local Test
do
  local _class_0
  local _base_0 = {
    __name = "Test",
    getId = function(self)
      return self.id
    end,
    __type = function(self)
      return "Test"
    end
  }
  _base_0.__index = _base_0
  _class_0 = setmetatable({
    __init = function(self) end,
    __base = _base_0
  }, {
    __index = _base_0,
    __call = function(cls, ...)
      local _self_0 = setmetatable({}, _base_0)
      cls.__init(_self_0, ...)
      return _self_0
    end
  })
  Test = _class_0
end
`)
  },
  getterAndSetter: function() {
    expect(
      parseCode(`
        class Test
          _get _set id

          __type() 
            return "Test" 
          end
        end
      `)
    ).to.equal(`local Test
do
  local _class_0
  local _base_0 = {
    __name = "Test",
    setId = function(self, id)
      self.id = id
      return self
    end,
    getId = function(self)
      return self.id
    end,
    __type = function(self)
      return "Test"
    end
  }
  _base_0.__index = _base_0
  _class_0 = setmetatable({
    __init = function(self) end,
    __base = _base_0
  }, {
    __index = _base_0,
    __call = function(cls, ...)
      local _self_0 = setmetatable({}, _base_0)
      cls.__init(_self_0, ...)
      return _self_0
    end
  })
  Test = _class_0
end
`)
  }
}