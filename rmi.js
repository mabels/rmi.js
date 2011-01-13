

var BaseTest = function() {
  this.args = []
  for(var i = arguments.length-1; i >= 0; --i) {
    this.args[i] = arguments[i]
  }
  this.level = arguments.length
}

BaseTest.prototype.getLevel = function() {
  var self = this
  return function() { return self.level }
}

/*
BaseTest.prototype.createDB = function(database, call) {
  call()
  return new function(database){
    this.database = database
  }(database)
}
*/

var HandleManager = function(name) {
  this.refs = {}
  this.handle = 1;
  this.addRef = function(ref, id) {
    if (id) {
      this.refs[id] = ref
      return id
    }
    for(var handle in this.refs) { 
      if (this.refs[handle] === ref) { return handle; }
    }
    id = "$"+name+"."+(this.handle++)+"$"
    this.refs[id] = ref
    return id;
  }
  this.getRef = function(handle) {
    return this.refs[handle]
  }
  this.delHandle = function(handle) {
    delete this.refs[handle]
  }
}

var RMIServerHandles = new HandleManager('srv')
var RMIClientHandles = new HandleManager('clt')

                    

asRMI = function(handles, invoke) {
  return function() {
    var recurse = function(val) {
      if (typeof(val) == 'function') {
          return { __RmiFunction__: handles.addRef(val) }
      } else if (!!(val && val.concat && val.unshift && !val.callee) || !!(val && val.callee)) {
        /* isArray or isArguments */
        return function(val) {
          var dst = []
          for(var l = val.length-1; l >= 0; --l) {
            dst[l] = recurse(val[l]) 
          }
          return dst
        }(val)
      } else if (typeof(val) == 'object') {
        return function(val) {
          dst = { __RmiObject__: handles.addRef(val) } 
          val.__RmiInvoke__ = invoke
          for(var key in val) {
            if (key == 'asRMI') { continue; }
            if (key == '__RmiInvoke__') { continue; }
            dst[key] = recurse(val[key])
          }
          return dst
        }(val)
      } 
      return val
    }
    return recurse(this)
  }
}

var toRMI = function(handler, invoked) {
  return function (key, value) {
    if (key == "__RmiObject__") {
      handler.addRef(this, value)
    } else if (value && value.__RmiFunction__) {
      return function() { 
        var cbs = []
        var got_ret = false
        var return_value = function(value) { 
console.log('RETURN_VALUE:'+JSON.stringify(value)+":"+ret.__RmiFunction__)
          handler.delHandle(ret.__RmiFunction__)
          for(var l = cbs.length-1; l >= 0; --l) { cbs[l](value) }
          got_ret = true
          return_value = value
        }
        var ret = asRMI(handler).apply(return_value)
        invoked({
                  obj: this.__RmiObject__, 
                  func: value.__RmiFunction__, 
                  args: asRMI(handler).apply(arguments), 
                  ret:  ret
                }) 
        return {
                 value: function(cb) { 
                  if (got_ret) { cb(return_value) }
                  else { cbs.push(cb)  }
                 }
               }
      }
    }
    return value;
  }
}

var RMIServer = {
  build: function(obj, invoke) {
   obj.asRMI = asRMI(RMIServerHandles, invoke);
   return obj;
  },
  invoke: function(str) {
    var invokation = JSON.parse(str, toRMI(RMIServerHandles, function(obj) {
      RMIClient.invoke(JSON.stringify(obj))
    })) 
    console.log('RMIServer.Invocation:'+str)
    var obj = RMIServerHandles.getRef(invokation.obj)
    var func = RMIServerHandles.getRef(invokation.func)
    console.log("obj:"+obj)
    console.log("func:"+func)
    invokation.ret(func.apply(obj, invokation.args))
  }
}

var RMIClient = {
  build: function(str, invoked) {
    return JSON.parse(str, toRMI(RMIClientHandles, invoked))
  },
  invoke: function(str) {
    console.log('RMIClient:invoke:'+str)
    var invokation = JSON.parse(str, toRMI(RMIClientHandles, function(obj) {
      RMIServer.invoke(JSON.stringify(obj))
    }))
    var obj = RMIClientHandles.getRef(invokation.obj) || {}
    var func = RMIClientHandles.getRef(invokation.func)
    console.log("obj:"+obj)
    console.log("func:"+func)
    func.apply(obj, invokation.args)
  }
}

var srv = RMIServer.build(new BaseTest('meno'), function(obj, func, args) {
})

json = JSON.stringify(srv.asRMI())

var clt = RMIClient.build(json, function(obj) {
  var json = JSON.stringify(obj)
console.log('client:invokation:'+json)
  return RMIServer.invoke(json)
})

/*var ret = clt.createDB('meno', function() {
  console.log('callback on created')
})
*/
ret = clt.getLevel()

ret.value(function(value) {
  value().value(function(value) { console.log('f-callback:'+value) }) 
})


