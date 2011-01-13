

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
    this.save = function(data, cb) {
      cb(data+data)
    }
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

RMI ={}
RMI.once = function(fn) {
  return fn
}
                    

asRMI = function(handles) {
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
          for(var key in val) {
            if (key == 'asRMI') { continue; }
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
  build: function(obj) {
   obj.asRMI = asRMI(RMIServerHandles);
   return obj;
  },
  invoke: function(str) {
    var invocation = JSON.parse(str, toRMI(RMIServerHandles, function(obj) {
      RMIClient.invoke(JSON.stringify(obj))
    })) 
    //console.log('RMIServer.Invocation:'+str)
    var obj = RMIServerHandles.getRef(invocation.obj)
    var func = RMIServerHandles.getRef(invocation.func)
    //console.log("obj:"+obj)
    //console.log("func:"+func)
    invocation.ret(func.apply(obj, invocation.args))
  }
}

var RMIClient = {
  build: function(str, invoked) {
    return JSON.parse(str, toRMI(RMIClientHandles, invoked))
  },
  invoke: function(str) {
    //console.log('RMIClient:invoke:'+str)
    var invocation = JSON.parse(str, toRMI(RMIClientHandles, function(obj) {
      RMIServer.invoke(JSON.stringify(obj))
    }))
    var obj = RMIClientHandles.getRef(invocation.obj) || {}
    var func = RMIClientHandles.getRef(invocation.func)
    //console.log("obj:"+obj)
    //console.log("func:"+func)
    func.apply(obj, invocation.args)
  }
}

var srv = RMIServer.build(new BaseTest('meno'))

json = JSON.stringify(srv.asRMI())

var clt = RMIClient.build(json, function(obj) {
  var json = JSON.stringify(obj)
//console.log('client:invocation:'+json)
  return RMIServer.invoke(json)
})

/*
var ret = clt.createDB('meno', RMI.once(function() {
  console.log('createDB:callback')
}))
ret.value(function(value) {
  console.log('createDB:return:'+JSON.stringify(value))
  value.save('meno', RMI.once(function(done) {
    console.log('createDB:save:'+done)
  }))
})

*/

for(var i = 0; i < 1; ++i) {
ret = clt.getLevel()

ret.value(function(value) {
  value().value(function(value) { 
 //   console.log('f-callback:'+value) 
  }) 
})

if (!(i % 1000)) {
  var j = 0
  var k = 0
  for(var ref in RMIClientHandles.refs) { ++j }
  for(var ref in RMIServerHandles.refs) { 
   console.log(ref,  RMIServerHandles.refs[ref])
   ++k 
  }
  console.log('C:'+j+":S:"+k)
  console.log('C:'+JSON.stringify(RMIClientHandles.refs))
  console.log("S:"+JSON.stringify(RMIServerHandles.refs))
}
}



