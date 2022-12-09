local Test
do
  local _class_0
  local _base_0 = {
    __name = "Test",
    test__receiveCreateTag = function(self, ply)
      local x
    end,
    __type = function(self)
      return self.__name
    end
  }
  _base_0.__index = _base_0
  _class_0 = setmetatable({
    __init = function(self)
      self:receive("CreateTag", self.test__receiveCreateTag)
    end,
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
