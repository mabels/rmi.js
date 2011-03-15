RMI = function(cb, prefix) {
  this.__Handles = new this.HandleManager(prefix || "rmi");
  this.__Callback = cb;
};

RMI.prototype = {
  HandleManager: function(name) {
    this.refs = {};
    this.handle = parseInt(Math.random()*(100000),10);
    this.addRef = function(ref, opts) {
      if (opts) {
        this.refs[opts.id] = ref;
        return opts;
      }
      
      for(var handle in this.refs) { 
        if (this.refs[handle] === ref) { return handle; }
      }
      
      id = "$" + name + "." + (this.handle++) + "$";
      this.refs[id] = ref;
      opts || (opts = {});
      opts.id = id;
      return opts;
    };
    
    this.getRef = function(handle) {
      return this.refs[handle];
    };
    
    this.delHandle = function(handle) {
      delete this.refs[handle];
    };
  },
  
  as: function(handles, type, params) {
    return function() {
      var recurse = function(val, opts) {
        if (typeof(val) == "function") {
          opts = {};
          opts["__" + (type || "RmiFunction") + "__"] = handles.addRef(val, params);
          return opts;
        } else if (!!(val && val.concat && val.unshift && !val.callee) || !!(val && val.callee)) {
          /* isArray or isArguments */
          return function(val, l, dst) {
            dst = [];
            for (l = val.length-1; l >= 0; --l) {
              dst[l] = recurse(val[l]); 
            }
            return dst;
          }(val);
        } else if (typeof(val) == "object") {
          return function(val, key, dst) {
            dst = { __RmiObject__: handles.addRef(val, params) };
            for (key in val) {
              if (key == "asRMI") { continue; }
              dst[key] = recurse(val[key]);
            }
            return dst;
          }(val);
        } else {
          return val;
        }
      };
      return recurse(this);
    };
  },
  
  to: function(handler, RMI) {
    RMI = this;
    
    return function (key, value) {
      var callback = function() {
        var called_arguments = arguments;
        var called_instance = this;
        
        return {
          call: function(cb, params) {
            var got_ret = false;
            var opts = {
              obj: called_instance.__RmiObject__,
              func: value.__RmiFunction__ || value.__RmiCallback__,
              args: (params && params.plain) ? (function() { called_arguments.plain = true; return called_arguments })() : RMI.as(handler).apply(called_arguments)
            };
            
            if (cb) {
              var return_value = function(value) {
                handler.delHandle(ret.__RmiFunction__||ret.__RmiCallback__);
                
                cb(value);
                got_ret = true;
                return_value = value;
              };
              
              var ret = RMI.as(handler).apply(return_value);
              
              opts.ret = ret;
            }
            
            RMI.__Callback(opts);
            if (cb) {
              if (got_ret) {
                cb(return_value);
              }
            }
          }
        };
      };
      
      if (key == "__RmiObject__") {
        handler.addRef(this, {id: value});
      } else if (value && value.__RmiCallback__) {
        return function() {
          callback.apply({}, arguments).call(null, value.__RmiCallback__);
        };
      } else if (value && value.__RmiFunction__) {
        return callback;
      }
      return value;
    };
  },
  
  server: function(obj) {
    obj.asRMI = this.as(this.__Handles);
    return obj;
  },
  
  client: function(str) {
    var RMI = this,
        ret = JSON.parse(str, this.to(this.__Handles));
    
    ret.cb = function(fn) {
      return RMI.as(RMI.__Handles, "RmiCallback").apply(fn);
    };
    
    ret.cb.plain = function(fn) {
      return RMI.as(RMI.__Handles, "RmiCallback", {plain: true}).apply(fn);
    };
    
    return ret;
  },
  
  invoke: function(str) {
    var invocation = JSON.parse(str, this.to(this.__Handles)),
        obj = invocation.obj ? this.__Handles.getRef(invocation.obj.id) : undefined,
        func = this.__Handles.getRef(invocation.func.id),
        args;
    
    if(invocation.args.plain) {
      delete invocation.args.plain;
      
      args = [];
      for (var i in invocation.args) {
        args[i] = invocation.args[i];
      }
    } else {
      args = invocation.args;
    }
    
    ret = func.apply(obj, args);
    
    invocation.ret && invocation.ret(ret).call();
  }
};
