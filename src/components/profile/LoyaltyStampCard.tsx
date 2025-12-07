import { Beef, Gift } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface LoyaltyStampCardProps {
  completedOrders: number;
  rewardThreshold?: number;
}

export function LoyaltyStampCard({ completedOrders, rewardThreshold = 5 }: LoyaltyStampCardProps) {
  // Calculate current progress (resets after each reward claim)
  const currentProgress = completedOrders % rewardThreshold;
  const rewardsEarned = Math.floor(completedOrders / rewardThreshold);
  const isComplete = currentProgress === 0 && completedOrders > 0;
  const isAlmostComplete = currentProgress === rewardThreshold - 1;

  // Create stamps array
  const stamps = Array.from({ length: rewardThreshold }, (_, i) => {
    const position = i + 1;
    const isGiftPosition = position === rewardThreshold;
    const isFilled = isComplete || i < currentProgress;
    
    return { position, isGiftPosition, isFilled };
  });

  return (
    <div className="glass-card p-5 overflow-hidden relative">
      {/* Background glow when complete */}
      {isComplete && (
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 animate-pulse" />
      )}
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            <h3 className="font-heading text-lg text-foreground">Loyalty Rewards</h3>
          </div>
          <span className="text-sm text-muted-foreground bg-secondary px-2 py-1 rounded-full">
            {currentProgress}/{rewardThreshold}
          </span>
        </div>

        {/* Stamps Row */}
        <div className="flex items-center justify-between gap-2 mb-4">
          {stamps.map(({ position, isGiftPosition, isFilled }) => (
            <motion.div
              key={position}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: position * 0.1, type: 'spring' }}
              className={cn(
                "flex-1 aspect-square rounded-xl flex items-center justify-center transition-all duration-300",
                isFilled 
                  ? "bg-primary shadow-glow" 
                  : "bg-secondary/50 border border-border",
                isGiftPosition && isAlmostComplete && !isFilled && "animate-pulse border-primary"
              )}
            >
              {isGiftPosition ? (
                <motion.div
                  animate={isComplete ? { 
                    scale: [1, 1.2, 1],
                    rotate: [0, -10, 10, 0]
                  } : isAlmostComplete ? {
                    scale: [1, 1.1, 1]
                  } : {}}
                  transition={{ 
                    repeat: isComplete || isAlmostComplete ? Infinity : 0, 
                    duration: 1.5 
                  }}
                >
                  <Gift 
                    className={cn(
                      "w-6 h-6",
                      isFilled ? "text-primary-foreground" : "text-muted-foreground"
                    )} 
                  />
                </motion.div>
              ) : (
                <Beef 
                  className={cn(
                    "w-6 h-6",
                    isFilled ? "text-primary-foreground" : "text-muted-foreground"
                  )} 
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Status Text */}
        {isComplete ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center p-3 bg-primary/10 rounded-lg border border-primary/30"
          >
            <p className="text-primary font-heading text-lg">
              🎉 Congrats! You've earned a reward!
            </p>
            <p className="text-sm text-primary/80 mt-1">
              Show this screen to staff for Free Fries or a Drink
            </p>
          </motion.div>
        ) : (
          <p className="text-center text-muted-foreground text-sm">
            Order <span className="text-primary font-semibold">{rewardThreshold - currentProgress}</span> more 
            {rewardThreshold - currentProgress === 1 ? ' time' : ' times'} to unlock Free Fries or a Drink!
          </p>
        )}

        {/* Total rewards earned badge */}
        {rewardsEarned > 0 && (
          <div className="mt-3 text-center">
            <span className="text-xs text-muted-foreground">
              Total rewards earned: <span className="text-primary font-semibold">{rewardsEarned}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
