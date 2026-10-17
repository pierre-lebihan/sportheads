      private var physicsWorld:b2World;
      private var physicsBodies:Array;
      private var physicsJoints:Array;
      private var physicsStepContacts:Array;

      public function physicsLoad(config:Object) : Object {
         var bounds:b2AABB = new b2AABB();
         bounds.lowerBound.Set(-10000,-10000);
         bounds.upperBound.Set(10000,10000);
         physicsWorld = new b2World(bounds,new b2Vec2(config.gravity[0],config.gravity[1]),false);
         physicsWorld.SetContinuousPhysics(Boolean(config.continuous));
         physicsBodies = [];
         physicsJoints = [];
         physicsStepContacts = [];
         for each (var spec:Object in config.bodies) {
            var definition:b2BodyDef = new b2BodyDef();
            definition.position.Set(spec.x,spec.y);
            definition.fixedRotation = Boolean(spec.fixed);
            var body:b2Body = physicsWorld.CreateBody(definition);
            var shape:b2ShapeDef;
            if (spec.type == "circle") {
               var circle:b2CircleDef = new b2CircleDef();
               circle.radius = spec.radius;
               shape = circle;
            } else {
               var box:b2PolygonDef = new b2PolygonDef();
               box.SetAsBox(spec.hx,spec.hy);
               shape = box;
            }
            shape.density = spec.density;
            shape.friction = spec.friction;
            shape.restitution = spec.restitution;
            body.CreateShape(shape);
            body.SetMassFromShapes();
            body.SetXForm(new b2Vec2(spec.x,spec.y),spec.angle);
            body.SetLinearVelocity(new b2Vec2(spec.vx,spec.vy));
            body.SetAngularVelocity(spec.omega);
            physicsBodies.push(body);
         }
         for each (var jointSpec:Object in config.joints) {
            var jointDef:b2RevoluteJointDef = new b2RevoluteJointDef();
            jointDef.Initialize(physicsBodies[jointSpec.a],physicsBodies[jointSpec.b],new b2Vec2(jointSpec.x,jointSpec.y));
            jointDef.enableMotor = true;
            jointDef.maxMotorTorque = jointSpec.torque;
            physicsJoints.push(physicsWorld.CreateJoint(jointDef));
         }
         return physicsState();
      }

      public function physicsState() : Object {
         var result:Object = {bodies:[],joints:[],contacts:physicsContacts(),contactsDuringStep:physicsStepContacts};
         for each (var body:b2Body in physicsBodies) {
            result.bodies.push({x:body.GetPosition().x,y:body.GetPosition().y,
               vx:body.GetLinearVelocity().x,vy:body.GetLinearVelocity().y,
               angle:body.GetAngle(),omega:body.GetAngularVelocity(),
               mass:body.GetMass(),inertia:body.GetInertia()});
         }
         for each (var joint:b2RevoluteJoint in physicsJoints) {
            var a:b2Vec2 = joint.GetAnchor1();
            var b:b2Vec2 = joint.GetAnchor2();
            result.joints.push({angle:joint.GetJointAngle(),anchorError:Math.sqrt((b.x-a.x)*(b.x-a.x)+(b.y-a.y)*(b.y-a.y))});
         }
         return result;
      }

      private function physicsContacts() : Array {
         var result:Array = [];
         var contact:b2Contact = physicsWorld.b2internal::m_contactList;
         while (contact != null) {
            for each (var manifold:b2Manifold in contact.GetManifolds()) {
               if (manifold.pointCount > 0) result.push({points:manifold.pointCount});
            }
            contact = contact.GetNext();
         }
         return result;
      }

      public function physicsStep(motors:Array) : Object {
         for (var i:int=0; i<physicsJoints.length; i++) physicsJoints[i].SetMotorSpeed(motors[i]);
         physicsStepContacts = [];
         for (var step:int=0; step<3; step++) {
            physicsWorld.Step(1/96,48,48);
            physicsStepContacts.push(physicsContacts());
         }
         return physicsState();
      }
