"""Instrument KeyPoll; audit verifies other decompiled classes are unchanged.

Also prepare the separate MainTimeline source used only in the seeded variant.
"""
from pathlib import Path

source = Path('evidence/decompiled/scripts/KeyPoll.as').read_text()
source = source.replace('import flash.display.DisplayObject;', '''import Box2D.Common.Math.b2Vec2;
   import Box2D.Common.b2internal;
   import Box2D.Collision.b2AABB;
   import Box2D.Collision.Shapes.*;
   import Box2D.Dynamics.*;
   import Box2D.Dynamics.Contacts.b2Contact;
   import Box2D.Dynamics.Joints.*;
   import Box2D.Collision.b2Manifold;
   import flash.display.DisplayObject;
   import flash.display.DisplayObjectContainer;
   import flash.external.ExternalInterface;''')
source = source.replace('   public class KeyPoll', '   use namespace b2internal;\n\n   public class KeyPoll')
anchor = 'dispObj = param1;'
assert source.count(anchor) == 1
source = source.replace(anchor, anchor + '''
         if (ExternalInterface.available) {
            ExternalInterface.addCallback("probeState", probeState);
            ExternalInterface.addCallback("probeCall", probeCall);
            ExternalInterface.addCallback("probeSet", probeSet);
            ExternalInterface.addCallback("probeKeys", probeKeys);
            ExternalInterface.addCallback("probeStep", probeStep);
            ExternalInterface.addCallback("probeBodySet", probeBodySet);
            ExternalInterface.addCallback("probeSeed", probeSeed);
            ExternalInterface.addCallback("probeReplayStart", probeReplayStart);
            ExternalInterface.addCallback("probeReplayResult", probeReplayResult);
            ExternalInterface.addCallback("probeSetPath", probeSetPath);
            ExternalInterface.addCallback("physicsLoad", physicsLoad);
            ExternalInterface.addCallback("physicsState", physicsState);
            ExternalInterface.addCallback("physicsStep", physicsStep);
         }
''')
anchor = '      public function isDown(param1:uint) : Boolean'
assert source.count(anchor) == 1
source = source.replace(anchor, '''      private static var randomState:uint = 1;
      private var replaySchedule:Array;
      private var replayStates:Array;
      private var replayIndex:int;

      public static function probeRandom() : Number {
         randomState = uint((1664525 * Number(randomState) + 1013904223) % 4294967296);
         return Number(randomState) / 4294967296;
      }

      public function probeSeed(seed:uint) : Boolean {
         randomState = seed;
         return true;
      }

      public function probeReplayStart(schedule:Array) : Boolean {
         replaySchedule = schedule;
         replayStates = [];
         replayIndex = 0;
         probeRoot().addEventListener(Event.ENTER_FRAME, probeBeforeFrame, false, 10000);
         probeRoot().addEventListener(Event.ENTER_FRAME, probeAfterFrame, false, -10000);
         return true;
      }

      private function probeBeforeFrame(event:Event) : void {
         probeKeys(replaySchedule[replayIndex]);
      }

      private function probeAfterFrame(event:Event) : void {
         replayStates.push(probeState());
         replayIndex++;
         if (replayIndex >= replaySchedule.length) {
            probeRoot().removeEventListener(Event.ENTER_FRAME, probeBeforeFrame);
            probeRoot().removeEventListener(Event.ENTER_FRAME, probeAfterFrame);
         }
      }

      public function probeReplayResult() : Object {
         return {complete:replaySchedule != null && replayIndex >= replaySchedule.length,
            states:replayStates, count:replayIndex};
      }

      public function probeSetPath(path:String, value:Object) : Boolean {
         var parts:Array = path.split(".");
         var r:Object = probeRoot();
         for (var i:int=0; i<parts.length-1; i++) r = r[parts[i]];
         r[parts[parts.length-1]] = value;
         return true;
      }

      private function probeRoot() : Object {
         return DisplayObjectContainer(dispObj).getChildAt(0);
      }

      public function probeState() : Object {
         var r:Object = probeRoot();
         var result:Object = {
            frame:r.currentFrame, label:r.currentLabel, frameName:r.frameName,
            paused:r.pauseGame, timer:r.timer, timeLeft:r.timeLeft,
            timeLeftTicks:r.timeLeftBitch, scoreLeft:r.scoreLeft, scoreRight:r.scoreRight,
            twoPlayers:r.TwoPlayers, xspeed:r.xspeed, oppxspeed:r.oppxspeed,
            powerupTimer:r.PUTimer, inGoal:r.inGoal,
            heroSpeed:r.heroPUSpeed, heroJump:r.heroPUJump, heroFreeze:r.heroPUFreeze,
            oppSpeed:r.oppPUSpeed, oppJump:r.oppPUJump, oppFreeze:r.oppPUFreeze,
            bodies:[]
         };
         for each (var n:String in ["hero", "opp", "ball", "racket", "oppracket"]) {
            var b:Object = r[n];
            if (b != null) {
               result.bodies.push({name:n, x:b.GetPosition().x, y:b.GetPosition().y,
                  vx:b.GetLinearVelocity().x, vy:b.GetLinearVelocity().y,
                  angle:b.GetAngle(), omega:b.GetAngularVelocity()});
            }
         }
         return result;
      }

      public function probeCall(n:String, args:Array) : Object {
         var r:Object = probeRoot();
         var parts:Array = n.split(".");
         for (var i:int=0; i<parts.length-1; i++) r = r[parts[i]];
         return r[parts[parts.length-1]].apply(r,args);
      }

      public function probeSet(n:String, value:Object) : Boolean {
         probeRoot()[n] = value;
         return true;
      }

      public function probeKeys(keys:Array) : Boolean {
         for (var i:int=0; i<32; i++) states[i]=0;
         for each (var k:uint in keys) states[k >>> 3] |= 1 << (k & 7);
         return true;
      }

      public function probeStep(keys:Array, count:int) : Object {
         probeKeys(keys);
         for (var i:int=0; i<count; i++) probeRoot().onFrame_game();
         return probeState();
      }

      public function probeBodySet(n:String, x:Number, y:Number, vx:Number, vy:Number, angle:Number, omega:Number) : Boolean {
         var b:Object = probeRoot()[n];
         b.SetXForm(new b2Vec2(x,y),angle);
         b.SetLinearVelocity(new b2Vec2(vx,vy));
         b.SetAngularVelocity(omega);
         b.WakeUp();
         return true;
      }

''' + anchor)
physics = Path('scripts/physics-probe.as.inc').read_text()
source = source.replace(anchor, physics + anchor)
out = Path('evidence/instrumentation/KeyPoll.as')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(source)
print(out)

main = Path('evidence/decompiled/scripts/SPL_2012_7_fla/MainTimeline.as').read_text()
count = main.count('Math.random()')
assert count > 0
Path('evidence/instrumentation/MainTimeline.as').write_text(main.replace('Math.random()', 'KeyPoll.probeRandom()'))
print('Prepared separate seeded variant:', count, 'random calls redirected; gameplay rules unchanged in source')
